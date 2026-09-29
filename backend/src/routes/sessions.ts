import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// All session routes require authentication
router.use(authenticate);

// POST /api/v1/sessions — Create a session, creator becomes owner
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, projectName } = req.body;

    if (!name || !projectName) {
      res.status(400).json({ error: 'Session name and project name are required' });
      return;
    }

    const session = await prisma.reviewSession.create({
      data: {
        name,
        projectName,
        participants: {
          create: {
            userId: req.user!.userId,
            role: 'owner',
          },
        },
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    res.status(201).json({ session });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/sessions — List sessions the current user participates in
router.get('/', async (req: Request, res: Response) => {
  try {
    const sessions = await prisma.reviewSession.findMany({
      where: {
        participants: {
          some: { userId: req.user!.userId },
        },
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ sessions });
  } catch (error) {
    console.error('List sessions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/sessions/:id — Get a single session (must be a participant)
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const session = await prisma.reviewSession.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Check if user is a participant
    const isParticipant = session.participants.some(
      (p) => p.userId === req.user!.userId,
    );

    if (!isParticipant) {
      res.status(403).json({ error: 'You are not a participant of this session' });
      return;
    }

    res.json({ session });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/sessions/:id/join — Join a session as a member
router.post('/:id/join', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const session = await prisma.reviewSession.findUnique({
      where: { id },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Check if already a participant
    const existing = await prisma.sessionParticipant.findUnique({
      where: {
        userId_sessionId: {
          userId: req.user!.userId,
          sessionId: id,
        },
      },
    });

    if (existing) {
      res.status(409).json({ error: 'You are already a participant of this session' });
      return;
    }

    await prisma.sessionParticipant.create({
      data: {
        userId: req.user!.userId,
        sessionId: id,
        role: 'member',
      },
    });

    // Return the full session with participants
    const updatedSession = await prisma.reviewSession.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    res.json({ session: updatedSession });
  } catch (error) {
    console.error('Join session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/sessions/:id/files — Upload/paste a code file
router.post('/:id/files', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { filename, language, content, path } = req.body;

    if (!filename || !content) {
      res.status(400).json({ error: 'Filename and content are required' });
      return;
    }

    const session = await prisma.reviewSession.findUnique({ where: { id } });
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const file = await prisma.reviewFile.create({
      data: {
        filename,
        path: path || '',
        language: language || 'plaintext',
        content,
        sessionId: id,
      },
    });

    res.status(201).json({ file });
  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/sessions/:id/files — List files in a session
router.get('/:id/files', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const files = await prisma.reviewFile.findMany({
      where: { sessionId: id },
      select: { id: true, filename: true, path: true, language: true, createdAt: true },
      orderBy: [{ path: 'asc' }, { filename: 'asc' }],
    });

    res.json({ files });
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/sessions/:id/files/seed — Seed sample files with folder structure
router.post('/:id/files/seed', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const sampleFiles = [
      {
        filename: 'index.js',
        path: 'src',
        language: 'javascript',
        content: `import express from 'express';
import { userRouter } from './routes/users.js';
import { dbConnect } from './utils/db.js';

const app = express();
app.use(express.json());
app.use('/api/users', userRouter);

dbConnect().then(() => {
  app.listen(3000, () => console.log('Server on :3000'));
});
`,
      },
      {
        filename: 'users.js',
        path: 'src/routes',
        language: 'javascript',
        content: `import { Router } from 'express';

const router = Router();

// GET /api/users — list all users
router.get('/', async (req, res) => {
  const query = "SELECT * FROM users WHERE role = '" + req.query.role + "'";
  const users = await db.query(query);
  res.json(users);
});

// POST /api/users — create a user
router.post('/', async (req, res) => {
  const { name, email } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const user = await db.insert('users', { name, email });
  res.status(201).json(user);
});

export { router as userRouter };
`,
      },
      {
        filename: 'db.js',
        path: 'src/utils',
        language: 'javascript',
        content: `let connection = null;

export async function dbConnect() {
  if (connection) return connection;
  connection = await createConnection(process.env.DATABASE_URL);
  return connection;
}

export function formatDate(date) {
  return new Date(date).toISOString().split('T')[0];
}

export function deepClone(obj) {
  return structuredClone(obj);
}
`,
      },
      {
        filename: 'helpers.js',
        path: 'src/utils',
        language: 'javascript',
        content: `// Debounce utility
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Average of numbers
export function average(numbers) {
  if (numbers.length === 0) return 0;
  const sum = numbers.reduce((acc, n) => acc + n, 0);
  return sum / numbers.length;
}

// Capitalize first letter
export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
`,
      },
      {
        filename: 'README.md',
        path: '',
        language: 'markdown',
        content: `# Sample Project

A sample Express.js project for code review.

## Structure

\`\`\`
src/
  index.js        - App entry point
  routes/
    users.js      - User CRUD endpoints
  utils/
    db.js         - Database connection
    helpers.js    - Utility functions
\`\`\`

## Known Issues

- SQL injection in users.js (line 7)
- No input validation on email field
`,
      },
    ];

    const created = await prisma.$transaction(
      sampleFiles.map((f) =>
        prisma.reviewFile.create({
          data: {
            filename: f.filename,
            path: f.path,
            language: f.language,
            content: f.content,
            sessionId: id,
          },
        }),
      ),
    );

    res.status(201).json({ files: created });
  } catch (error) {
    console.error('Seed file error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/sessions/:id/dashboard — Aggregated review stats
router.get('/:id/dashboard', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verify session exists and user is a participant
    const session = await prisma.reviewSession.findUnique({
      where: { id },
      include: {
        participants: { select: { userId: true } },
        files: { select: { id: true } },
      },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const isParticipant = session.participants.some(
      (p) => p.userId === req.user!.userId,
    );
    if (!isParticipant) {
      res.status(403).json({ error: 'Not a participant' });
      return;
    }

    const fileIds = session.files.map((f) => f.id);

    if (fileIds.length === 0) {
      res.json({
        sessionName: session.name,
        projectName: session.projectName,
        totalFiles: 0,
        totalIssues: 0,
        criticalIssues: 0,
        warningIssues: 0,
        infoIssues: 0,
        acceptedIssues: 0,
        rejectedIssues: 0,
        pendingIssues: 0,
        totalComments: 0,
        resolvedComments: 0,
        unresolvedComments: 0,
        reviewProgress: 0,
        issuesBySeverity: [],
        issuesByType: [],
      });
      return;
    }

    // AI Issues aggregation
    const [totalIssues, criticalIssues, warningIssues, infoIssues, acceptedIssues, rejectedIssues] =
      await Promise.all([
        prisma.aiIssue.count({ where: { fileId: { in: fileIds } } }),
        prisma.aiIssue.count({ where: { fileId: { in: fileIds }, severity: 'critical' } }),
        prisma.aiIssue.count({ where: { fileId: { in: fileIds }, severity: 'warning' } }),
        prisma.aiIssue.count({ where: { fileId: { in: fileIds }, severity: 'info' } }),
        prisma.aiIssue.count({ where: { fileId: { in: fileIds }, status: 'accepted' } }),
        prisma.aiIssue.count({ where: { fileId: { in: fileIds }, status: 'rejected' } }),
      ]);

    const pendingIssues = totalIssues - acceptedIssues - rejectedIssues;

    // Comment aggregation (only root threads, not replies)
    const [totalComments, resolvedComments] = await Promise.all([
      prisma.lineComment.count({
        where: { fileId: { in: fileIds }, parentCommentId: null },
      }),
      prisma.lineComment.count({
        where: { fileId: { in: fileIds }, parentCommentId: null, resolved: true },
      }),
    ]);

    const unresolvedComments = totalComments - resolvedComments;

    // Review progress: (resolved comments + accepted/rejected issues) / (total comments + total issues)
    const totalItems = totalComments + totalIssues;
    const handledItems = resolvedComments + acceptedIssues + rejectedIssues;
    const reviewProgress = totalItems > 0
      ? Math.round((handledItems / totalItems) * 100)
      : 0;

    // Issues grouped by type for chart
    const issuesByType = await prisma.aiIssue.groupBy({
      by: ['type'],
      where: { fileId: { in: fileIds } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    res.json({
      sessionName: session.name,
      projectName: session.projectName,
      totalFiles: fileIds.length,
      totalIssues,
      criticalIssues,
      warningIssues,
      infoIssues,
      acceptedIssues,
      rejectedIssues,
      pendingIssues,
      totalComments,
      resolvedComments,
      unresolvedComments,
      reviewProgress,
      issuesBySeverity: [
        { severity: 'critical', count: criticalIssues },
        { severity: 'warning', count: warningIssues },
        { severity: 'info', count: infoIssues },
      ],
      issuesByType: issuesByType.map((g) => ({ type: g.type, count: g._count.id })),
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
