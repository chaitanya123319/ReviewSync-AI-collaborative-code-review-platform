import { useState, useRef, useEffect, type FormEvent } from 'react';
import { apiClient } from '../api/apiClient';
import { useAuth } from '../context/AuthContext';

/* ─── Types ─── */
export interface Author {
  id: string;
  name: string;
  email: string;
}

export interface CommentReply {
  id: string;
  line: number;
  body: string;
  createdAt: string;
  parentCommentId: string;
  author: Author;
}

export interface ThreadComment {
  id: string;
  line: number;
  body: string;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: Author | null;
  parentCommentId: string | null;
  createdAt: string;
  author: Author;
  replies: CommentReply[];
}

interface CommentsResponse {
  comments: ThreadComment[];
}

type FilterMode = 'open' | 'resolved' | 'all';

interface CommentsPanelProps {
  fileId: string | null;
  threads: ThreadComment[];
  onThreadsChange: (threads: ThreadComment[]) => void;
  onLineClick?: (line: number) => void;
}

/* ─── Inline Reply Form ─── */
function ReplyForm({
  threadId,
  fileId,
  line,
  onReplyAdded,
}: {
  threadId: string;
  fileId: string;
  line: number;
  onReplyAdded: (reply: CommentReply) => void;
}) {
  const { token } = useAuth();
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setIsSubmitting(true);
    try {
      const data = await apiClient.post<{ comment: CommentReply }>(
        `/api/v1/files/${fileId}/comments`,
        { line, body: body.trim(), parentCommentId: threadId },
        { token },
      );
      onReplyAdded(data.comment);
      setBody('');
    } catch (err) {
      console.error('Failed to post reply:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-2 pl-4 border-l-2 border-indigo-100">
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a reply…"
        rows={2}
        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none resize-none bg-gray-50"
      />
      <div className="flex justify-end gap-1.5 mt-1">
        <button
          type="submit"
          disabled={isSubmitting || !body.trim()}
          className="px-2.5 py-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded transition-colors"
        >
          {isSubmitting ? '…' : 'Reply'}
        </button>
      </div>
    </form>
  );
}

/* ─── Single Thread Card ─── */
function ThreadCard({
  thread,
  fileId,
  onReplyAdded,
  onResolveToggle,
  onLineClick,
}: {
  thread: ThreadComment;
  fileId: string;
  onReplyAdded: (threadId: string, reply: CommentReply) => void;
  onResolveToggle: (threadId: string) => void;
  onLineClick?: (line: number) => void;
}) {
  const [showReply, setShowReply] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const { token } = useAuth();

  const handleResolve = async () => {
    setIsResolving(true);
    try {
      await apiClient.patch(
        `/api/v1/comments/${thread.id}/resolve`,
        {},
        { token },
      );
      onResolveToggle(thread.id);
    } catch (err) {
      console.error('Failed to resolve:', err);
    } finally {
      setIsResolving(false);
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div
      className={`p-3 border-b border-gray-100 ${
        thread.resolved ? 'opacity-60' : ''
      }`}
    >
      {/* Root comment header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center">
            <span className="text-[10px] font-bold text-indigo-600">
              {thread.author.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="text-xs font-semibold text-gray-800">
            {thread.author.name}
          </span>
          <button
            onClick={() => onLineClick?.(thread.line)}
            className="text-xs text-indigo-500 font-mono hover:text-indigo-700 transition-colors"
            title="Jump to line"
          >
            L{thread.line}
          </button>
        </div>
        <span className="text-[10px] text-gray-400">
          {timeAgo(thread.createdAt)}
        </span>
      </div>

      {/* Root comment body */}
      <p className="text-sm text-gray-700 mb-2 leading-relaxed">{thread.body}</p>

      {/* Action buttons */}
      <div className="flex items-center gap-3 mb-1">
        <button
          onClick={() => setShowReply(!showReply)}
          className="text-[11px] font-medium text-gray-500 hover:text-indigo-600 transition-colors flex items-center gap-1"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
          Reply
        </button>
        <button
          onClick={handleResolve}
          disabled={isResolving}
          className={`text-[11px] font-medium transition-colors flex items-center gap-1 ${
            thread.resolved
              ? 'text-green-600 hover:text-orange-500'
              : 'text-gray-500 hover:text-green-600'
          }`}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {thread.resolved ? 'Reopen' : 'Resolve'}
        </button>
      </div>

      {/* Replies */}
      {thread.replies.length > 0 && (
        <div className="ml-3 pl-3 border-l-2 border-gray-100 space-y-2 mt-2">
          {thread.replies.map((reply) => (
            <div key={reply.id}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center">
                  <span className="text-[9px] font-bold text-gray-500">
                    {reply.author.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-gray-700">
                  {reply.author.name}
                </span>
                <span className="text-[10px] text-gray-400">
                  {timeAgo(reply.createdAt)}
                </span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">{reply.body}</p>
            </div>
          ))}
        </div>
      )}

      {/* Reply form */}
      {showReply && (
        <ReplyForm
          threadId={thread.id}
          fileId={fileId}
          line={thread.line}
          onReplyAdded={(reply) => {
            onReplyAdded(thread.id, reply);
            setShowReply(false);
          }}
        />
      )}

      {/* Resolved badge */}
      {thread.resolved && thread.resolvedBy && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-green-600">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Resolved by {thread.resolvedBy.name}
        </div>
      )}
    </div>
  );
}

/* ─── Main CommentsPanel ─── */
export default function CommentsPanel({
  fileId,
  threads,
  onThreadsChange,
  onLineClick,
}: CommentsPanelProps) {
  const [filter, setFilter] = useState<FilterMode>('all');

  if (!fileId) return null;

  const openCount = threads.filter((t) => !t.resolved).length;
  const resolvedCount = threads.filter((t) => t.resolved).length;

  // Group by line, then flatten (so visual order is line-based)
  const filtered = threads.filter((t) => {
    if (filter === 'open') return !t.resolved;
    if (filter === 'resolved') return t.resolved;
    return true;
  });

  // Group by line number
  const lineGroups = new Map<number, ThreadComment[]>();
  for (const t of filtered) {
    const group = lineGroups.get(t.line) || [];
    group.push(t);
    lineGroups.set(t.line, group);
  }
  const sortedLines = [...lineGroups.keys()].sort((a, b) => a - b);

  const handleReplyAdded = (threadId: string, reply: CommentReply) => {
    const updated = threads.map((t) =>
      t.id === threadId ? { ...t, replies: [...t.replies, reply] } : t,
    );
    onThreadsChange(updated);
  };

  const handleResolveToggle = (threadId: string) => {
    // The actual API call already happened in ThreadCard;
    // the real-time Socket.IO event will update state.
    // But as a fallback for the user who triggered it, update locally:
    const updated = threads.map((t) =>
      t.id === threadId
        ? { ...t, resolved: !t.resolved, resolvedAt: t.resolved ? null : new Date().toISOString() }
        : t,
    );
    onThreadsChange(updated);
  };

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col flex-shrink-0 h-full">
      {/* Header */}
      <div className="p-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Comments
          </span>
          <span className="text-[11px] text-gray-400">
            {threads.length} thread{threads.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Filter toggle */}
        <div className="flex bg-gray-100 rounded-md p-0.5">
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 px-2 py-1 text-[11px] font-medium rounded transition-colors ${
              filter === 'all'
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            All ({threads.length})
          </button>
          <button
            onClick={() => setFilter('open')}
            className={`flex-1 px-2 py-1 text-[11px] font-medium rounded transition-colors ${
              filter === 'open'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Open ({openCount})
          </button>
          <button
            onClick={() => setFilter('resolved')}
            className={`flex-1 px-2 py-1 text-[11px] font-medium rounded transition-colors ${
              filter === 'resolved'
                ? 'bg-white text-green-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Resolved ({resolvedCount})
          </button>
        </div>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <svg className="w-8 h-8 mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-xs">
              {filter === 'all'
                ? 'No comments yet'
                : filter === 'open'
                  ? 'No open threads'
                  : 'No resolved threads'}
            </p>
            {filter === 'all' && (
              <p className="text-[10px] mt-1">Click a line number to start</p>
            )}
          </div>
        )}

        {sortedLines.map((lineNum) => (
          <div key={lineNum}>
            {/* Line group header */}
            <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
              <button
                onClick={() => onLineClick?.(lineNum)}
                className="text-[11px] font-mono font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                Line {lineNum}
              </button>
            </div>

            {lineGroups.get(lineNum)!.map((thread) => (
              <ThreadCard
                key={thread.id}
                thread={thread}
                fileId={fileId}
                onReplyAdded={handleReplyAdded}
                onResolveToggle={handleResolveToggle}
                onLineClick={onLineClick}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
