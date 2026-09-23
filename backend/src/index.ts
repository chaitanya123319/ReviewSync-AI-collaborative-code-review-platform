import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import authRoutes from './routes/auth';
import sessionRoutes from './routes/sessions';
import fileRoutes from './routes/files';
import commentRoutes from './routes/comments';
import aiReviewRoutes, { aiIssueRouter } from './routes/ai-review';
import { setupSocket } from './socket';

const app = express();
const PORT = process.env.PORT || 3001;
const server = createServer(app);

setupSocket(server);

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Health checks
app.get('/', (_req, res) => {
  res.json({ message: 'Hello from ReviewSync AI Backend' });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/sessions', sessionRoutes);
app.use('/api/v1/files', fileRoutes);
app.use('/api/v1/files', aiReviewRoutes);
app.use('/api/v1/comments', commentRoutes);
app.use('/api/v1/ai-issues', aiIssueRouter);

server.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
