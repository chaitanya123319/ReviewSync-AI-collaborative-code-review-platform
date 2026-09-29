import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor as monacoEditor } from 'monaco-editor';
import type * as Monaco from 'monaco-editor';
import { useAuth } from '../context/AuthContext';
import { useOnlineUsers } from '../hooks/useOnlineUsers';
import { apiClient } from '../api/apiClient';
import { socketClient } from '../api/socket';
import CommentComposer from '../components/CommentComposer';
import CommentsPanel, {
  type ThreadComment,
  type CommentReply,
} from '../components/CommentsPanel';
import AIIssuesPanel, { type AiIssue } from '../components/AIIssuesPanel';
import FileTree from '../components/FileTree';

/* ─── Types ─── */
interface FileInfo {
  id: string;
  filename: string;
  path: string;
  language: string;
  createdAt: string;
}

interface FileData {
  id: string;
  filename: string;
  path: string;
  language: string;
  content: string;
  comments: ThreadComment[];
}

interface FilesResponse {
  files: FileInfo[];
}

interface FileResponse {
  file: FileData;
}

interface CommentAddedEvent {
  fileId: string;
  comment: CommentReply & { parentCommentId: string | null };
}

interface CommentResolvedEvent {
  fileId: string;
  comment: ThreadComment;
}

interface AiReviewProgressEvent {
  fileId: string;
  status: string;
}

interface AiIssuesReadyEvent {
  fileId: string;
  issues: AiIssue[];
}

interface AiIssueUpdatedEvent {
  fileId: string;
  issue: AiIssue;
}

type RightPanel = 'comments' | 'ai';

/* ─── Severity colors for inline widgets ─── */
const SEV_COLORS: Record<string, { bg: string; border: string; text: string; accent: string }> = {
  critical: { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', accent: '#ef4444' },
  warning:  { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', accent: '#f59e0b' },
  info:     { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af', accent: '#3b82f6' },
};

/* ─── Component ─── */
export default function SessionPage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const { token } = useAuth();
  const onlineUsers = useOnlineUsers(sessionId);

  const [files, setFiles] = useState<FileInfo[]>([]);
  const [activeFile, setActiveFile] = useState<FileData | null>(null);
  const [threads, setThreads] = useState<ThreadComment[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  // AI review state
  const [aiIssues, setAiIssues] = useState<AiIssue[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel>('comments');

  // Comment composer state
  const [composerLine, setComposerLine] = useState<number | null>(null);
  const [composerTop, setComposerTop] = useState(0);

  // Monaco editor ref + monaco namespace ref
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const decorationsRef = useRef<monacoEditor.IEditorDecorationsCollection | null>(null);
  const aiDecorationsRef = useRef<monacoEditor.IEditorDecorationsCollection | null>(null);
  const widgetsRef = useRef<monacoEditor.IContentWidget[]>([]);

  // Keep a ref to activeFile id for socket handler closures
  const activeFileIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeFileIdRef.current = activeFile?.id ?? null;
  }, [activeFile?.id]);

  /* ─── Fetch file list ─── */
  const fetchFiles = useCallback(async () => {
    if (!sessionId) return;
    setIsLoadingFiles(true);
    try {
      const data = await apiClient.get<FilesResponse>(
        `/api/v1/sessions/${sessionId}/files`,
        { token },
      );
      setFiles(data.files);
      // Auto-select first file
      if (data.files.length > 0 && !activeFile) {
        loadFile(data.files[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch files:', err);
    } finally {
      setIsLoadingFiles(false);
    }
  }, [sessionId, token]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  /* ─── Load a single file ─── */
  const loadFile = async (fileId: string) => {
    setIsLoadingFile(true);
    setComposerLine(null);
    clearAiWidgets();
    try {
      const data = await apiClient.get<FileResponse>(
        `/api/v1/files/${fileId}`,
        { token },
      );
      setActiveFile(data.file);
      setThreads(data.file.comments);

      // Load existing AI issues for this file
      try {
        const aiData = await apiClient.get<{ issues: AiIssue[] }>(
          `/api/v1/files/${fileId}/ai-issues`,
          { token },
        );
        setAiIssues(aiData.issues);
      } catch {
        setAiIssues([]);
      }
    } catch (err) {
      console.error('Failed to load file:', err);
    } finally {
      setIsLoadingFile(false);
    }
  };

  /* ─── Seed a sample file ─── */
  const seedFile = async () => {
    if (!sessionId) return;
    setIsSeeding(true);
    try {
      await apiClient.post(
        `/api/v1/sessions/${sessionId}/files/seed`,
        {},
        { token },
      );
      await fetchFiles();
    } catch (err) {
      console.error('Failed to seed file:', err);
    } finally {
      setIsSeeding(false);
    }
  };

  /* ─── Submit a comment from the glyph-margin composer ─── */
  const handleCommentSubmit = async (line: number, body: string) => {
    if (!activeFile) return;
    await apiClient.post(
      `/api/v1/files/${activeFile.id}/comments`,
      { line, body },
      { token },
    );
  };

  /* ─── Run AI Review ─── */
  const handleRunAiReview = async () => {
    if (!activeFile) return;
    setIsAnalyzing(true);
    setRightPanel('ai');
    clearAiWidgets();
    setAiIssues([]);
    try {
      const data = await apiClient.post<{ issues: AiIssue[] }>(
        `/api/v1/files/${activeFile.id}/ai-review`,
        {},
        { token },
      );
      setAiIssues(data.issues);
    } catch (err) {
      console.error('AI review failed:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  /* ─── Accept AI issue: apply suggested fix in editor ─── */
  const handleAcceptIssue = (issue: AiIssue) => {
    setAiIssues((prev) =>
      prev.map((i) => (i.id === issue.id ? { ...i, status: 'accepted' } : i)),
    );

    // Apply suggested fix in editor (client-side only)
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (editor && model && issue.suggestedFix) {
      const lineContent = model.getLineContent(issue.line);
      // Extract leading whitespace from the original line
      const indent = lineContent.match(/^(\s*)/)?.[1] || '';
      const fixLines = issue.suggestedFix
        .split('\n')
        .map((l) => indent + l)
        .join('\n');

      // Push an edit to replace the line content
      model.pushEditOperations(
        [],
        [
          {
            range: {
              startLineNumber: issue.line,
              startColumn: 1,
              endLineNumber: issue.line,
              endColumn: lineContent.length + 1,
            },
            text: fixLines,
          },
        ],
        () => null,
      );
    }

    // Remove the inline widget for this issue
    removeWidgetForIssue(issue.id);
  };

  /* ─── Reject AI issue: remove inline widget ─── */
  const handleRejectIssue = (issue: AiIssue) => {
    setAiIssues((prev) =>
      prev.map((i) => (i.id === issue.id ? { ...i, status: 'rejected' } : i)),
    );
    removeWidgetForIssue(issue.id);
  };

  /* ─── Socket.IO: comment events ─── */
  useEffect(() => {
    const socket = socketClient.getSocket();
    if (!socket) return;

    const handleCommentAdded = (event: CommentAddedEvent) => {
      if (event.fileId !== activeFileIdRef.current) return;
      const { comment } = event;
      setThreads((prev) => {
        if (comment.parentCommentId) {
          return prev.map((t) =>
            t.id === comment.parentCommentId
              ? { ...t, replies: [...t.replies, comment as CommentReply] }
              : t,
          );
        } else {
          const newThread: ThreadComment = {
            ...comment,
            resolved: false,
            resolvedAt: null,
            resolvedBy: null,
            replies: [],
          };
          return [...prev, newThread];
        }
      });
    };

    const handleCommentResolved = (event: CommentResolvedEvent) => {
      if (event.fileId !== activeFileIdRef.current) return;
      setThreads((prev) =>
        prev.map((t) =>
          t.id === event.comment.id
            ? {
                ...t,
                resolved: event.comment.resolved,
                resolvedAt: event.comment.resolvedAt,
                resolvedBy: event.comment.resolvedBy,
              }
            : t,
        ),
      );
    };

    socket.on('comment_added', handleCommentAdded);
    socket.on('comment_resolved', handleCommentResolved);
    return () => {
      socket.off('comment_added', handleCommentAdded);
      socket.off('comment_resolved', handleCommentResolved);
    };
  }, []);

  /* ─── Socket.IO: AI review events ─── */
  useEffect(() => {
    const socket = socketClient.getSocket();
    if (!socket) return;

    const handleProgress = (event: AiReviewProgressEvent) => {
      if (event.fileId !== activeFileIdRef.current) return;
      if (event.status === 'analyzing') {
        setIsAnalyzing(true);
        setRightPanel('ai');
      }
    };

    const handleReady = (event: AiIssuesReadyEvent) => {
      if (event.fileId !== activeFileIdRef.current) return;
      setAiIssues(event.issues);
      setIsAnalyzing(false);
    };

    const handleIssueUpdated = (event: AiIssueUpdatedEvent) => {
      if (event.fileId !== activeFileIdRef.current) return;
      setAiIssues((prev) =>
        prev.map((i) => (i.id === event.issue.id ? event.issue : i)),
      );
    };

    socket.on('ai_review_progress', handleProgress);
    socket.on('ai_issues_ready', handleReady);
    socket.on('ai_issue_updated', handleIssueUpdated);
    return () => {
      socket.off('ai_review_progress', handleProgress);
      socket.off('ai_issues_ready', handleReady);
      socket.off('ai_issue_updated', handleIssueUpdated);
    };
  }, []);

  /* ─── Monaco Editor mount ─── */
  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.updateOptions({ glyphMargin: true });

    editor.onMouseDown((e) => {
      const targetType = e.target.type;
      if (
        targetType === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
        targetType === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS
      ) {
        const lineNumber = e.target.position?.lineNumber;
        if (lineNumber) {
          const top = editor.getTopForLineNumber(lineNumber) - editor.getScrollTop();
          setComposerLine(lineNumber);
          setComposerTop(top);
        }
      }
    });
  };

  /* ─── Comment decorations ─── */
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !activeFile) return;

    const linesWithComments = [...new Set(threads.map((t) => t.line))];

    const newDecorations: monacoEditor.IModelDeltaDecoration[] =
      linesWithComments.map((lineNum) => {
        const threadCount = threads.filter((t) => t.line === lineNum).length;
        const allResolved = threads
          .filter((t) => t.line === lineNum)
          .every((t) => t.resolved);

        return {
          range: {
            startLineNumber: lineNum,
            startColumn: 1,
            endLineNumber: lineNum,
            endColumn: 1,
          },
          options: {
            glyphMarginClassName: allResolved
              ? 'comment-glyph-resolved'
              : 'comment-glyph-marker',
            glyphMarginHoverMessage: {
              value: `💬 ${threadCount} thread(s) on this line`,
            },
          },
        };
      });

    if (decorationsRef.current) decorationsRef.current.clear();
    decorationsRef.current = editor.createDecorationsCollection(newDecorations);
  }, [threads, activeFile]);

  /* ─── AI Issue decorations (line highlights) ─── */
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !activeFile) return;

    const pendingIssues = aiIssues.filter((i) => i.status === 'pending');

    const newDecorations: monacoEditor.IModelDeltaDecoration[] = pendingIssues.map(
      (issue) => {
        const sev = issue.severity;
        return {
          range: {
            startLineNumber: issue.line,
            startColumn: 1,
            endLineNumber: issue.line,
            endColumn: 1,
          },
          options: {
            isWholeLine: true,
            className:
              sev === 'critical'
                ? 'ai-issue-line-critical'
                : sev === 'warning'
                  ? 'ai-issue-line-warning'
                  : 'ai-issue-line-info',
            overviewRuler: {
              color:
                sev === 'critical'
                  ? '#ef4444'
                  : sev === 'warning'
                    ? '#f59e0b'
                    : '#3b82f6',
              position: monaco.editor.OverviewRulerLane.Right,
            },
          },
        };
      },
    );

    if (aiDecorationsRef.current) aiDecorationsRef.current.clear();
    aiDecorationsRef.current = editor.createDecorationsCollection(newDecorations);
  }, [aiIssues, activeFile]);

  /* ─── AI Issue inline content widgets ─── */
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // Clear existing widgets first
    clearAiWidgets();

    const pendingIssues = aiIssues.filter((i) => i.status === 'pending');

    pendingIssues.forEach((issue) => {
      const sev = SEV_COLORS[issue.severity] || SEV_COLORS.info;
      const widgetId = `ai-issue-${issue.id}`;

      const domNode = document.createElement('div');
      domNode.className = 'ai-issue-widget';
      domNode.style.cssText = `
        background: ${sev.bg};
        border: 1px solid ${sev.border};
        border-left: 3px solid ${sev.accent};
        border-radius: 4px;
        padding: 6px 10px;
        margin: 2px 0 2px 40px;
        font-size: 12px;
        line-height: 1.4;
        max-width: 600px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        display: flex;
        flex-direction: column;
        gap: 4px;
        z-index: 5;
      `;

      // Header row: severity badge + title
      const header = document.createElement('div');
      header.style.cssText = 'display: flex; align-items: center; gap: 6px;';

      const badge = document.createElement('span');
      badge.textContent = issue.severity.toUpperCase();
      badge.style.cssText = `
        font-size: 9px; font-weight: 700; letter-spacing: 0.5px;
        padding: 1px 5px; border-radius: 3px;
        background: ${sev.accent}; color: white;
      `;

      const title = document.createElement('span');
      title.textContent = issue.title;
      title.style.cssText = `font-weight: 600; color: ${sev.text};`;

      header.appendChild(badge);
      header.appendChild(title);
      domNode.appendChild(header);

      // Explanation
      const expl = document.createElement('div');
      expl.textContent = issue.explanation;
      expl.style.cssText = `font-size: 11px; color: #4b5563; line-height: 1.5;`;
      domNode.appendChild(expl);

      // Action buttons row
      const actions = document.createElement('div');
      actions.style.cssText = 'display: flex; gap: 6px; margin-top: 2px;';

      const acceptBtn = document.createElement('button');
      acceptBtn.textContent = '✓ Accept Fix';
      acceptBtn.style.cssText = `
        font-size: 11px; font-weight: 600; padding: 2px 8px;
        border-radius: 3px; border: none; cursor: pointer;
        background: #16a34a; color: white;
      `;
      acceptBtn.onclick = (e) => {
        e.stopPropagation();
        handleAcceptIssue(issue);
      };

      const rejectBtn = document.createElement('button');
      rejectBtn.textContent = '✗ Dismiss';
      rejectBtn.style.cssText = `
        font-size: 11px; font-weight: 600; padding: 2px 8px;
        border-radius: 3px; border: 1px solid #d1d5db; cursor: pointer;
        background: white; color: #4b5563;
      `;
      rejectBtn.onclick = (e) => {
        e.stopPropagation();
        handleRejectIssue(issue);
      };

      actions.appendChild(acceptBtn);
      actions.appendChild(rejectBtn);
      domNode.appendChild(actions);

      const widget: monacoEditor.IContentWidget = {
        getId: () => widgetId,
        getDomNode: () => domNode,
        getPosition: () => ({
          position: { lineNumber: issue.line, column: 1 },
          preference: [1], // BELOW
        }),
        allowEditorOverflow: true,
      };

      editor.addContentWidget(widget);
      widgetsRef.current.push(widget);
    });
  }, [aiIssues, activeFile]);

  /* ─── Clear AI widgets from editor ─── */
  const clearAiWidgets = () => {
    const editor = editorRef.current;
    if (!editor) return;
    for (const w of widgetsRef.current) {
      editor.removeContentWidget(w);
    }
    widgetsRef.current = [];
  };

  /* ─── Remove single widget by issue ID ─── */
  const removeWidgetForIssue = (issueId: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const widgetId = `ai-issue-${issueId}`;
    const idx = widgetsRef.current.findIndex((w) => w.getId() === widgetId);
    if (idx !== -1) {
      editor.removeContentWidget(widgetsRef.current[idx]);
      widgetsRef.current.splice(idx, 1);
    }
  };

  /* ─── Jump to line in editor ─── */
  const scrollToLine = (line: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
  };

  /* ─── Render ─── */
  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-gray-800">Code Review</h1>
          {activeFile && (
            <span className="px-2 py-0.5 text-xs font-mono bg-gray-100 text-gray-600 rounded">
              {activeFile.path ? `${activeFile.path}/` : ''}{activeFile.filename}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Dashboard link */}
          <Link
            to={`/sessions/${sessionId}/dashboard`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            📊 Dashboard
          </Link>

          {/* AI Review Button */}
          {activeFile && (
            <button
              onClick={handleRunAiReview}
              disabled={isAnalyzing}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                isAnalyzing
                  ? 'bg-purple-100 text-purple-600 cursor-not-allowed'
                  : 'bg-purple-600 text-white hover:bg-purple-700 shadow-sm'
              }`}
            >
              {isAnalyzing ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Analyzing…
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                  Run AI Review
                </>
              )}
            </button>
          )}

          {/* Online users */}
          {onlineUsers.map((u) => (
            <div
              key={u.userId}
              className="flex items-center gap-1.5 px-2 py-1 bg-green-50 rounded-full"
              title={u.email}
            >
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs font-medium text-green-700">{u.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* File sidebar */}
        <div className="w-56 bg-gray-50 border-r border-gray-200 overflow-y-auto flex-shrink-0">
          <div className="p-3 border-b border-gray-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Files
              </span>
              <button
                onClick={seedFile}
                disabled={isSeeding}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium disabled:opacity-50"
                title="Seed sample project files"
              >
                {isSeeding ? '...' : '+ Sample'}
              </button>
            </div>
            {files.length > 0 && (
              <div className="text-[10px] text-gray-400">
                {files.length} file{files.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>

          {isLoadingFiles && (
            <div className="p-3 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-6 bg-gray-200 rounded animate-pulse" />
              ))}
            </div>
          )}

          {!isLoadingFiles && files.length === 0 && (
            <div className="p-4 text-center">
              <p className="text-xs text-gray-400 mb-2">No files yet</p>
              <button
                onClick={seedFile}
                disabled={isSeeding}
                className="text-xs px-3 py-1.5 text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:opacity-50"
              >
                Add Sample Files
              </button>
            </div>
          )}

          {!isLoadingFiles && files.length > 0 && (
            <FileTree
              files={files}
              activeFileId={activeFile?.id ?? null}
              onFileSelect={(fileId) => loadFile(fileId)}
            />
          )}
        </div>

        {/* Editor area */}
        <div className="flex-1 relative">
          {isLoadingFile && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
              <div className="text-sm text-gray-500">Loading file...</div>
            </div>
          )}

          {!activeFile && !isLoadingFile && (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Select a file to start reviewing
            </div>
          )}

          {activeFile && (
            <>
              <Editor
                height="100%"
                language={activeFile.language}
                value={activeFile.content}
                theme="vs"
                onMount={handleEditorMount}
                options={{
                  readOnly: false,
                  lineNumbers: 'on',
                  glyphMargin: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 13,
                  lineHeight: 20,
                  renderLineHighlight: 'all',
                  folding: true,
                  wordWrap: 'off',
                }}
              />

              {composerLine !== null && (
                <CommentComposer
                  line={composerLine}
                  anchorTop={composerTop}
                  onSubmit={handleCommentSubmit}
                  onClose={() => setComposerLine(null)}
                />
              )}
            </>
          )}
        </div>

        {/* Right sidebar panel toggle + content */}
        {activeFile && (
          <div className="flex flex-col flex-shrink-0 h-full">
            {/* Tab toggle */}
            <div className="flex border-b border-gray-200 bg-white">
              <button
                onClick={() => setRightPanel('comments')}
                className={`flex-1 px-3 py-2 text-[11px] font-medium transition-colors ${
                  rightPanel === 'comments'
                    ? 'text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50/50'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                💬 Comments{threads.length > 0 ? ` (${threads.length})` : ''}
              </button>
              <button
                onClick={() => setRightPanel('ai')}
                className={`flex-1 px-3 py-2 text-[11px] font-medium transition-colors ${
                  rightPanel === 'ai'
                    ? 'text-purple-700 border-b-2 border-purple-600 bg-purple-50/50'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                🤖 AI Issues
                {aiIssues.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-purple-100 text-purple-700 rounded-full">
                    {aiIssues.filter((i) => i.status === 'pending').length}
                  </span>
                )}
                {isAnalyzing && (
                  <span className="ml-1 inline-block w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                )}
              </button>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-hidden">
              {rightPanel === 'comments' ? (
                <CommentsPanel
                  fileId={activeFile.id}
                  threads={threads}
                  onThreadsChange={setThreads}
                  onLineClick={scrollToLine}
                />
              ) : (
                <AIIssuesPanel
                  issues={aiIssues}
                  onIssuesChange={setAiIssues}
                  onAccept={handleAcceptIssue}
                  onReject={handleRejectIssue}
                  onLineClick={scrollToLine}
                  isAnalyzing={isAnalyzing}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Inject CSS for glyphs and AI issue highlights */}
      <style>{`
        .comment-glyph-marker {
          background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%234f46e5'%3E%3Cpath d='M8 1a7 7 0 0 0-7 7c0 3.87 3.13 7 7 7a1 1 0 0 0 .55-.17l2.9 1.1a.5.5 0 0 0 .65-.65l-1.1-2.9A7 7 0 0 0 8 1zm0 1.5a5.5 5.5 0 0 1 3.23 9.95.75.75 0 0 0-.33.57l.66 1.74-1.74-.66a.75.75 0 0 0-.57.05A5.5 5.5 0 1 1 8 2.5z'/%3E%3C/svg%3E") center center / 14px 14px no-repeat;
          cursor: pointer;
        }
        .comment-glyph-resolved {
          background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%2322c55e'%3E%3Cpath d='M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zm2.85 3.15a.75.75 0 0 1 .1 1.06l-3.5 4a.75.75 0 0 1-1.1.04l-1.75-1.75a.75.75 0 1 1 1.06-1.06l1.18 1.18 2.95-3.37a.75.75 0 0 1 1.06-.1z'/%3E%3C/svg%3E") center center / 14px 14px no-repeat;
          cursor: pointer;
        }
        .ai-issue-line-critical {
          background: rgba(239, 68, 68, 0.08) !important;
          border-left: 3px solid #ef4444;
        }
        .ai-issue-line-warning {
          background: rgba(245, 158, 11, 0.08) !important;
          border-left: 3px solid #f59e0b;
        }
        .ai-issue-line-info {
          background: rgba(59, 130, 246, 0.08) !important;
          border-left: 3px solid #3b82f6;
        }
        .ai-issue-widget button:hover {
          opacity: 0.85;
        }
      `}</style>
    </div>
  );
}
