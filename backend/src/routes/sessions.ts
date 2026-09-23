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
    const { filename, language, content } = req.body;

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
      select: { id: true, filename: true, language: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ files });
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/sessions/:id/files/seed — Seed a sample JS file for testing
router.post('/:id/files/seed', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const sampleContent = `// utils.js — Utility functions for ReviewSync
import { formatDistanceToNow } from 'date-fns';

/**
 * Format a date string into a human-readable relative time.
 * @param {string} dateStr - ISO date string
 * @returns {string} e.g. "3 minutes ago"
 */
export function timeAgo(dateStr) {
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
}

/**
 * Debounce a function call.
 * @param {Function} fn - The function to debounce
 * @param {number} delay - Delay in milliseconds
 */
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Deep clone an object using structured clone.
 */
export function deepClone(obj) {
  return structuredClone(obj);
}

// Calculate the average of an array of numbers
export function average(numbers) {
  if (numbers.length === 0) return 0;
  const sum = numbers.reduce((acc, n) => acc + n, 0);
  return sum / numbers.length;
}

// Capitalize the first letter of a string
export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export default {
  timeAgo,
  debounce,
  deepClone,
  average,
  capitalize,
};
`;

    const file = await prisma.reviewFile.create({
      data: {
        filename: 'utils.js',
        language: 'javascript',
        content: sampleContent,
        sessionId: id,
      },
    });

    res.status(201).json({ file });
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
