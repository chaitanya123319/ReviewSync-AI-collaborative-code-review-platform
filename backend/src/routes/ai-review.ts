import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/authenticate';
import { getIO } from '../socket';

const router = Router();

router.use(authenticate);

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://ai-service:8000';

// ─── POST /api/v1/files/:fileId/ai-review — Trigger AI review ───
router.post('/:fileId/ai-review', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;

    const file = await prisma.reviewFile.findUnique({
      where: { id: fileId },
      select: { id: true, content: true, language: true, sessionId: true },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Emit progress event immediately
    try {
      const io = getIO();
      io.to(file.sessionId).emit('ai_review_progress', {
        fileId,
        status: 'analyzing',
      });
    } catch (e) {
      console.error('Socket emit error:', e);
    }

    // Call the AI service
    const analyzeResponse = await fetch(`${AI_SERVICE_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: file.content,
        language: file.language,
      }),
    });

    if (!analyzeResponse.ok) {
      const errBody = await analyzeResponse.text();
      console.error('AI service error:', analyzeResponse.status, errBody);
      res.status(502).json({ error: 'AI service returned an error', detail: errBody });
      return;
    }

    const analysisResult = (await analyzeResponse.json()) as {
      issues: Array<{
        line: number;
        type: string;
        severity: string;
        title: string;
        explanation: string;
        suggested_fix: string;
      }>;
    };

    // Delete any existing AI issues for this file (re-review)
    await prisma.aiIssue.deleteMany({ where: { fileId } });

    // Store each issue in the database
    const storedIssues = await Promise.all(
      analysisResult.issues.map((issue) =>
        prisma.aiIssue.create({
          data: {
            line: issue.line,
            type: issue.type,
            severity: issue.severity,
            title: issue.title,
            explanation: issue.explanation,
            suggestedFix: issue.suggested_fix,
            fileId,
          },
        }),
      ),
    );

    // Emit ai_issues_ready with the full list
    try {
      const io = getIO();
      io.to(file.sessionId).emit('ai_issues_ready', {
        fileId,
        issues: storedIssues,
      });
    } catch (e) {
      console.error('Socket emit error:', e);
    }

    res.status(200).json({ issues: storedIssues });
  } catch (error) {
    console.error('AI review error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/v1/files/:fileId/ai-issues — Get stored AI issues ───
router.get('/:fileId/ai-issues', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;

    const file = await prisma.reviewFile.findUnique({ where: { id: fileId } });
    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const issues = await prisma.aiIssue.findMany({
      where: { fileId },
      orderBy: { line: 'asc' },
    });

    res.json({ issues });
  } catch (error) {
    console.error('Get AI issues error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PATCH /api/v1/ai-issues/:id — Accept or reject an AI issue ───
// NOTE: This route is mounted at /api/v1/ai-issues in index.ts
export const aiIssueRouter = Router();
aiIssueRouter.use(authenticate);

aiIssueRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['accepted', 'rejected', 'pending'].includes(status)) {
      res.status(400).json({
        error: 'Status must be one of: accepted, rejected, pending',
      });
      return;
    }

    const issue = await prisma.aiIssue.findUnique({
      where: { id },
      include: { file: { select: { sessionId: true } } },
    });

    if (!issue) {
      res.status(404).json({ error: 'AI issue not found' });
      return;
    }

    const updated = await prisma.aiIssue.update({
      where: { id },
      data: { status },
    });

    // Emit socket event so other clients see the status change
    try {
      const io = getIO();
      io.to(issue.file.sessionId).emit('ai_issue_updated', {
        fileId: issue.fileId,
        issue: updated,
      });
    } catch (e) {
      console.error('Socket emit error:', e);
    }

    res.json({ issue: updated });
  } catch (error) {
    console.error('Update AI issue error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
