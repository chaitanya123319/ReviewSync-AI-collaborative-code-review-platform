import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/authenticate';
import { getIO } from '../socket';

const router = Router();

// All comment routes require authentication
router.use(authenticate);

const authorSelect = { id: true, name: true, email: true };

// ─── PATCH /api/v1/comments/:id/resolve — Toggle resolve on a comment ───
router.patch('/:id/resolve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const comment = await prisma.lineComment.findUnique({
      where: { id },
      include: { file: { select: { id: true, sessionId: true } } },
    });

    if (!comment) {
      res.status(404).json({ error: 'Comment not found' });
      return;
    }

    // Only root comments can be resolved (not replies)
    if (comment.parentCommentId) {
      res.status(400).json({ error: 'Only root comments (threads) can be resolved, not replies' });
      return;
    }

    const nowResolved = !comment.resolved;

    const updated = await prisma.lineComment.update({
      where: { id },
      data: {
        resolved: nowResolved,
        resolvedAt: nowResolved ? new Date() : null,
        resolvedById: nowResolved ? req.user!.userId : null,
      },
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
    });

    // Emit Socket.IO event to session room
    try {
      const io = getIO();
      io.to(comment.file.sessionId).emit('comment_resolved', {
        fileId: comment.fileId,
        comment: updated,
      });
    } catch (e) {
      console.error('Socket emit error:', e);
    }

    res.json({ comment: updated });
  } catch (error) {
    console.error('Resolve comment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
