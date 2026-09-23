import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/apiClient';

/* ─── Types ─── */
export interface AiIssue {
  id: string;
  line: number;
  type: string;
  severity: string;
  title: string;
  explanation: string;
  suggestedFix: string;
  status: string;
  createdAt: string;
  fileId: string;
}

interface AIIssuesPanelProps {
  issues: AiIssue[];
  onIssuesChange: (issues: AiIssue[]) => void;
  onAccept: (issue: AiIssue) => void;
  onReject: (issue: AiIssue) => void;
  onLineClick?: (line: number) => void;
  isAnalyzing: boolean;
}

const SEVERITY_CONFIG: Record<string, { bg: string; text: string; border: string; dot: string; label: string; order: number }> = {
  critical: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500', label: 'Critical', order: 0 },
  warning:  { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500', label: 'Warning', order: 1 },
  info:     { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500', label: 'Info', order: 2 },
};

const TYPE_LABELS: Record<string, string> = {
  bug: '🐛 Bug',
  logical_error: '🔀 Logic Error',
  security: '🔒 Security',
  performance: '⚡ Performance',
  code_quality: '📐 Quality',
  best_practice: '💡 Best Practice',
};

/* ─── Issue Card ─── */
function IssueCard({
  issue,
  onAccept,
  onReject,
  onLineClick,
}: {
  issue: AiIssue;
  onAccept: (issue: AiIssue) => void;
  onReject: (issue: AiIssue) => void;
  onLineClick?: (line: number) => void;
}) {
  const [isActing, setIsActing] = useState(false);
  const { token } = useAuth();
  const sev = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.info;
  const isHandled = issue.status === 'accepted' || issue.status === 'rejected';

  const handleAction = async (action: 'accepted' | 'rejected') => {
    setIsActing(true);
    try {
      await apiClient.patch<{ issue: AiIssue }>(
        `/api/v1/ai-issues/${issue.id}`,
        { status: action },
        { token },
      );
      if (action === 'accepted') onAccept(issue);
      else onReject(issue);
    } catch (err) {
      console.error(`Failed to ${action} issue:`, err);
    } finally {
      setIsActing(false);
    }
  };

  return (
    <div
      className={`p-3 border-b transition-all ${
        issue.status === 'accepted'
          ? 'bg-green-50/50 border-green-100 opacity-70'
          : issue.status === 'rejected'
            ? 'bg-gray-50 border-gray-100 opacity-50'
            : `${sev.bg} ${sev.border}`
      }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${sev.dot}`} />
          <span className={`text-[11px] font-semibold ${sev.text}`}>
            {sev.label}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 bg-white/60 rounded text-gray-500">
            {TYPE_LABELS[issue.type] || issue.type}
          </span>
        </div>
        <button
          onClick={() => onLineClick?.(issue.line)}
          className="text-[11px] font-mono text-indigo-500 hover:text-indigo-700 transition-colors"
          title="Jump to line"
        >
          L{issue.line}
        </button>
      </div>

      {/* Title */}
      <p className="text-sm font-medium text-gray-800 mb-1">{issue.title}</p>

      {/* Explanation */}
      <p className="text-xs text-gray-600 leading-relaxed mb-2">{issue.explanation}</p>

      {/* Suggested fix */}
      {issue.suggestedFix && (
        <div className="mb-2 p-2 bg-white/70 rounded border border-gray-100">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
            Suggested Fix
          </div>
          <p className="text-xs text-gray-700 font-mono leading-relaxed whitespace-pre-wrap">
            {issue.suggestedFix}
          </p>
        </div>
      )}

      {/* Status badge or action buttons */}
      {isHandled ? (
        <div className="flex items-center gap-1.5">
          <span
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
              issue.status === 'accepted'
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-200 text-gray-500'
            }`}
          >
            {issue.status === 'accepted' ? '✓ Accepted' : '✗ Rejected'}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleAction('accepted')}
            disabled={isActing}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-white bg-green-600 hover:bg-green-700 rounded transition-colors disabled:opacity-50"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Accept
          </button>
          <button
            onClick={() => handleAction('rejected')}
            disabled={isActing}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition-colors disabled:opacity-50"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Main Panel ─── */
export default function AIIssuesPanel({
  issues,
  onIssuesChange,
  onAccept,
  onReject,
  onLineClick,
  isAnalyzing,
}: AIIssuesPanelProps) {
  // Group issues by severity
  const grouped = new Map<string, AiIssue[]>();
  for (const issue of issues) {
    const group = grouped.get(issue.severity) || [];
    group.push(issue);
    grouped.set(issue.severity, group);
  }
  const sortedSeverities = [...grouped.keys()].sort(
    (a, b) => (SEVERITY_CONFIG[a]?.order ?? 99) - (SEVERITY_CONFIG[b]?.order ?? 99),
  );

  const pendingCount = issues.filter((i) => i.status === 'pending').length;
  const acceptedCount = issues.filter((i) => i.status === 'accepted').length;
  const rejectedCount = issues.filter((i) => i.status === 'rejected').length;

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col flex-shrink-0 h-full">
      {/* Header */}
      <div className="p-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              AI Issues
            </span>
            {isAnalyzing && (
              <span className="flex items-center gap-1 text-[11px] text-purple-600 font-medium">
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Analyzing…
              </span>
            )}
          </div>
        </div>

        {issues.length > 0 && (
          <div className="flex items-center gap-3 text-[10px] text-gray-400">
            <span className="text-amber-600 font-medium">{pendingCount} pending</span>
            <span className="text-green-600">{acceptedCount} accepted</span>
            <span className="text-gray-500">{rejectedCount} rejected</span>
          </div>
        )}
      </div>

      {/* Issue list */}
      <div className="flex-1 overflow-y-auto">
        {!isAnalyzing && issues.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <svg className="w-8 h-8 mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <p className="text-xs">No AI review yet</p>
            <p className="text-[10px] mt-1">Click "Run AI Review" to start</p>
          </div>
        )}

        {isAnalyzing && issues.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-3" />
            <p className="text-xs text-gray-500">AI is analyzing your code…</p>
            <p className="text-[10px] text-gray-400 mt-1">This may take a few seconds</p>
          </div>
        )}

        {sortedSeverities.map((severity) => (
          <div key={severity}>
            <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${SEVERITY_CONFIG[severity]?.dot || 'bg-gray-400'}`} />
                <span className="text-[11px] font-semibold text-gray-600">
                  {SEVERITY_CONFIG[severity]?.label || severity}
                </span>
                <span className="text-[10px] text-gray-400">
                  ({grouped.get(severity)!.length})
                </span>
              </div>
            </div>
            {grouped.get(severity)!.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                onAccept={onAccept}
                onReject={onReject}
                onLineClick={onLineClick}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
