import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/authenticate';
import { getIO } from '../socket';

const router = Router();

// All file routes require authentication
router.use(authenticate);

// ─── Author select helper ───
const authorSelect = { id: true, name: true, email: true };

// ─── GET /api/v1/files/:fileId — Get file content + its comments ───
router.get('/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;

    const file = await prisma.reviewFile.findUnique({
      where: { id: fileId },
      include: {
        comments: {
          include: {
            author: { select: authorSelect },
            resolvedBy: { select: authorSelect },
            replies: {
              include: {
                author: { select: authorSelect },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
          where: { parentCommentId: null }, // Only root comments
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.json({ file });
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/v1/files/:fileId/comments — Get threaded comments for a file ───
router.get('/:fileId/comments', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;

    const file = await prisma.reviewFile.findUnique({ where: { id: fileId } });
    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Fetch root comments with their replies
    const comments = await prisma.lineComment.findMany({
      where: { fileId, parentCommentId: null },
      include: {
        author: { select: authorSelect },
        resolvedBy: { select: authorSelect },
        replies: {
          include: {
            author: { select: authorSelect },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ comments });
  } catch (error) {
    console.error('List comments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/v1/files/:fileId/comments — Create a root comment or reply ───
router.post('/:fileId/comments', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const { line, body, parentCommentId } = req.body;

    if (line == null || !body) {
      res.status(400).json({ error: 'Line number and comment body are required' });
      return;
    }

    const file = await prisma.reviewFile.findUnique({
      where: { id: fileId },
      select: { id: true, sessionId: true },
    });
    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // If this is a reply, verify parent exists and belongs to the same file
    if (parentCommentId) {
      const parent = await prisma.lineComment.findUnique({
        where: { id: parentCommentId },
      });
      if (!parent || parent.fileId !== fileId) {
        res.status(404).json({ error: 'Parent comment not found in this file' });
        return;
      }
      // Replies must be on the same line as the parent
      if (parent.line !== Number(line)) {
        res.status(400).json({ error: 'Reply must be on the same line as the parent comment' });
        return;
      }
    }

    const comment = await prisma.lineComment.create({
      data: {
        line: Number(line),
        body,
        fileId,
        authorId: req.user!.userId,
        parentCommentId: parentCommentId || null,
      },
      include: {
        author: { select: authorSelect },
      },
    });

    // Emit Socket.IO event to session room
    try {
      const io = getIO();
      io.to(file.sessionId).emit('comment_added', {
        fileId,
        comment,
      });
    } catch (e) {
      console.error('Socket emit error:', e);
    }

    res.status(201).json({ comment });
  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
