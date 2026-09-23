import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import {
  signAccessToken,
  generateRefreshToken,
  getRefreshTokenExpiry,
} from '../lib/tokens';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// POST /api/v1/auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: 'Name, email, and password are required' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword },
    });

    // Issue tokens
    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const refreshTokenValue = generateRefreshToken();

    await prisma.refreshToken.create({
      data: {
        token: refreshTokenValue,
        expiresAt: getRefreshTokenExpiry(),
        userId: user.id,
      },
    });

    res.status(201).json({
      accessToken,
      refreshToken: refreshTokenValue,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // GitHub-only users have no password
    if (!user.password) {
      res.status(401).json({ error: 'This account uses GitHub login. Please sign in with GitHub.' });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Issue tokens
    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const refreshTokenValue = generateRefreshToken();

    await prisma.refreshToken.create({
      data: {
        token: refreshTokenValue,
        expiresAt: getRefreshTokenExpiry(),
        userId: user.id,
      },
    });

    res.json({
      accessToken,
      refreshToken: refreshTokenValue,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token is required' });
      return;
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    if (storedToken.expiresAt < new Date()) {
      // Clean up expired token
      await prisma.refreshToken.delete({ where: { id: storedToken.id } });
      res.status(401).json({ error: 'Refresh token has expired' });
      return;
    }

    // Rotate: delete old refresh token, issue new pair
    await prisma.refreshToken.delete({ where: { id: storedToken.id } });

    const newAccessToken = signAccessToken({
      userId: storedToken.user.id,
      email: storedToken.user.email,
    });
    const newRefreshTokenValue = generateRefreshToken();

    await prisma.refreshToken.create({
      data: {
        token: newRefreshTokenValue,
        expiresAt: getRefreshTokenExpiry(),
        userId: storedToken.user.id,
      },
    });

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshTokenValue,
    });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/auth/me
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, name: true, email: true, avatarUrl: true, githubId: true, createdAt: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GitHub OAuth ───

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';

// POST /api/v1/auth/github — Exchange GitHub OAuth code for JWT tokens
router.post('/github', async (req: Request, res: Response) => {
  try {
    const { code } = req.body;

    if (!code) {
      res.status(400).json({ error: 'Authorization code is required' });
      return;
    }

    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      res.status(500).json({ error: 'GitHub OAuth is not configured on the server' });
      return;
    }

    // 1. Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (tokenData.error || !tokenData.access_token) {
      console.error('GitHub token exchange error:', tokenData.error, tokenData.error_description);
      res.status(401).json({
        error: tokenData.error_description || 'Failed to authenticate with GitHub',
      });
      return;
    }

    const ghAccessToken = tokenData.access_token;

    // 2. Fetch GitHub user profile
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${ghAccessToken}`,
        Accept: 'application/json',
      },
    });

    if (!userResponse.ok) {
      res.status(502).json({ error: 'Failed to fetch GitHub user profile' });
      return;
    }

    const ghUser = (await userResponse.json()) as {
      id: number;
      login: string;
      name: string | null;
      email: string | null;
      avatar_url: string;
    };

    // 3. Fetch primary email if not public
    let email = ghUser.email;
    if (!email) {
      const emailsResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${ghAccessToken}`,
          Accept: 'application/json',
        },
      });

      if (emailsResponse.ok) {
        const emails = (await emailsResponse.json()) as Array<{
          email: string;
          primary: boolean;
          verified: boolean;
        }>;
        const primary = emails.find((e) => e.primary && e.verified);
        email = primary?.email || emails.find((e) => e.verified)?.email || null;
      }
    }

    if (!email) {
      res.status(400).json({
        error: 'Unable to retrieve email from GitHub. Please make sure your GitHub email is verified.',
      });
      return;
    }

    const githubId = String(ghUser.id);
    const displayName = ghUser.name || ghUser.login;
    const avatarUrl = ghUser.avatar_url;

    // 4. Find or create user
    // Priority: match by githubId first, then by email
    let user = await prisma.user.findUnique({ where: { githubId } });

    if (!user) {
      // Check if a user with this email already exists (link accounts)
      user = await prisma.user.findUnique({ where: { email } });

      if (user) {
        // Link GitHub to existing email-based account
        user = await prisma.user.update({
          where: { id: user.id },
          data: { githubId, avatarUrl },
        });
      } else {
        // Create brand new user
        user = await prisma.user.create({
          data: {
            name: displayName,
            email,
            password: '', // No password for GitHub-only users
            githubId,
            avatarUrl,
          },
        });
      }
    } else {
      // Update avatar on each login
      user = await prisma.user.update({
        where: { id: user.id },
        data: { avatarUrl },
      });
    }

    // 5. Issue JWT tokens
    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const refreshTokenValue = generateRefreshToken();

    await prisma.refreshToken.create({
      data: {
        token: refreshTokenValue,
        expiresAt: getRefreshTokenExpiry(),
        userId: user.id,
      },
    });

    res.json({
      accessToken,
      refreshToken: refreshTokenValue,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        githubId: user.githubId,
      },
    });
  } catch (error) {
    console.error('GitHub auth error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/auth/github/client-id — Return the client ID so frontend can build the authorize URL
router.get('/github/client-id', (_req: Request, res: Response) => {
  if (!GITHUB_CLIENT_ID) {
    res.status(404).json({ error: 'GitHub OAuth is not configured' });
    return;
  }
  res.json({ clientId: GITHUB_CLIENT_ID });
});

export default router;
