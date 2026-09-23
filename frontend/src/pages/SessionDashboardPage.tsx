import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
  PieChart,
  Pie,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/apiClient';

/* ─── Types ─── */
interface DashboardData {
  sessionName: string;
  projectName: string;
  totalFiles: number;
  totalIssues: number;
  criticalIssues: number;
  warningIssues: number;
  infoIssues: number;
  acceptedIssues: number;
  rejectedIssues: number;
  pendingIssues: number;
  totalComments: number;
  resolvedComments: number;
  unresolvedComments: number;
  reviewProgress: number;
  issuesBySeverity: Array<{ severity: string; count: number }>;
  issuesByType: Array<{ type: string; count: number }>;
}

const SEV_COLORS: Record<string, string> = {
  critical: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
};

const TYPE_LABELS: Record<string, string> = {
  bug: 'Bug',
  logical_error: 'Logic Error',
  security: 'Security',
  performance: 'Performance',
  code_quality: 'Quality',
  best_practice: 'Best Practice',
};

/* ─── Stat Card ─── */
function StatCard({
  label,
  value,
  icon,
  color = 'text-gray-800',
  bgColor = 'bg-white',
  subtitle,
}: {
  label: string;
  value: number | string;
  icon: string;
  color?: string;
  bgColor?: string;
  subtitle?: string;
}) {
  return (
    <div className={`${bgColor} rounded-lg border border-gray-200 p-4 shadow-sm`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          {label}
        </span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {subtitle && (
        <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
      )}
    </div>
  );
}

/* ─── Progress Ring ─── */
function ProgressRing({ value }: { value: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 80 ? '#22c55e' : value >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle
          cx="50" cy="50" r={radius}
          fill="none" stroke="#e5e7eb" strokeWidth="8"
        />
        <circle
          cx="50" cy="50" r={radius}
          fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          className="transition-all duration-700 ease-out"
        />
        <text
          x="50" y="50"
          textAnchor="middle" dominantBaseline="central"
          className="text-lg font-bold" fill={color}
          fontSize="18"
        >
          {value}%
        </text>
      </svg>
      <span className="text-xs font-medium text-gray-500">Review Progress</span>
    </div>
  );
}

/* ─── Main Page ─── */
export default function SessionDashboardPage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    setIsLoading(true);
    apiClient
      .get<DashboardData>(`/api/v1/sessions/${sessionId}/dashboard`, { token })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [sessionId, token]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="flex items-center gap-3 text-gray-500">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin" />
          Loading dashboard…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)] text-gray-500">
        <p className="text-lg mb-2">Failed to load dashboard</p>
        <p className="text-sm text-gray-400">{error}</p>
      </div>
    );
  }

  const severityData = data.issuesBySeverity.filter((s) => s.count > 0);
  const typeData = data.issuesByType.map((t) => ({
    ...t,
    label: TYPE_LABELS[t.type] || t.type,
  }));

  const commentPieData = [
    { name: 'Resolved', value: data.resolvedComments, fill: '#22c55e' },
    { name: 'Unresolved', value: data.unresolvedComments, fill: '#f59e0b' },
  ].filter((d) => d.value > 0);

  const issuePieData = [
    { name: 'Accepted', value: data.acceptedIssues, fill: '#22c55e' },
    { name: 'Rejected', value: data.rejectedIssues, fill: '#94a3b8' },
    { name: 'Pending', value: data.pendingIssues, fill: '#a78bfa' },
  ].filter((d) => d.value > 0);

  return (
    <div className="h-[calc(100vh-64px)] overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-lg font-bold text-gray-800">{data.sessionName}</h1>
              <span className="px-2 py-0.5 text-xs font-mono bg-gray-100 text-gray-500 rounded">
                {data.projectName}
              </span>
            </div>
            <p className="text-sm text-gray-400">
              Review dashboard · {data.totalFiles} file{data.totalFiles !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to={`/session/${sessionId}`}
              className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors"
            >
              ← Back to Review
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Stat cards row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <StatCard
            label="AI Issues"
            value={data.totalIssues}
            icon="🤖"
            color="text-purple-700"
          />
          <StatCard
            label="Critical"
            value={data.criticalIssues}
            icon="🔴"
            color="text-red-600"
            subtitle={data.totalIssues > 0 ? `${Math.round((data.criticalIssues / data.totalIssues) * 100)}% of issues` : undefined}
          />
          <StatCard
            label="Warnings"
            value={data.warningIssues}
            icon="🟡"
            color="text-amber-600"
          />
          <StatCard
            label="Comments"
            value={data.totalComments}
            icon="💬"
            color="text-indigo-700"
          />
          <StatCard
            label="Resolved"
            value={data.resolvedComments}
            icon="✅"
            color="text-green-600"
          />
          <StatCard
            label="Unresolved"
            value={data.unresolvedComments}
            icon="⏳"
            color="text-amber-600"
          />
        </div>

        {/* Progress + Charts row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Progress ring */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm flex flex-col items-center justify-center">
            <ProgressRing value={data.reviewProgress} />
            <div className="mt-4 text-center">
              <p className="text-xs text-gray-400">
                {data.reviewProgress === 100
                  ? 'All items reviewed!'
                  : `${100 - data.reviewProgress}% remaining`}
              </p>
            </div>
          </div>

          {/* Issues by Severity bar chart */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Issues by Severity
            </h3>
            {severityData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={severityData} barSize={36}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="severity"
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    tickFormatter={(v: string) => v.charAt(0).toUpperCase() + v.slice(1)}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 6 }}
                    labelFormatter={(v: string) => v.charAt(0).toUpperCase() + v.slice(1)}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {severityData.map((entry) => (
                      <Cell key={entry.severity} fill={SEV_COLORS[entry.severity] || '#6b7280'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-xs text-gray-400">
                No AI issues yet
              </div>
            )}
          </div>

          {/* Issues by Type bar chart */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Issues by Category
            </h3>
            {typeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={typeData} barSize={28} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    width={80}
                  />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-xs text-gray-400">
                No AI issues yet
              </div>
            )}
          </div>
        </div>

        {/* Bottom row: issue status + comment status pie charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* AI Issue Status */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
              AI Issue Status
            </h3>
            {issuePieData.length > 0 ? (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="50%" height={160}>
                  <PieChart>
                    <Pie
                      data={issuePieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={60}
                      dataKey="value"
                      stroke="none"
                    >
                      {issuePieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {issuePieData.map((d) => (
                    <div key={d.name} className="flex items-center gap-2 text-sm">
                      <span className="w-3 h-3 rounded-full" style={{ background: d.fill }} />
                      <span className="text-gray-600">{d.name}</span>
                      <span className="font-semibold text-gray-800">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[160px] text-xs text-gray-400">
                No AI issues yet
              </div>
            )}
          </div>

          {/* Comment Status */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Comment Threads
            </h3>
            {commentPieData.length > 0 ? (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="50%" height={160}>
                  <PieChart>
                    <Pie
                      data={commentPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={60}
                      dataKey="value"
                      stroke="none"
                    >
                      {commentPieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {commentPieData.map((d) => (
                    <div key={d.name} className="flex items-center gap-2 text-sm">
                      <span className="w-3 h-3 rounded-full" style={{ background: d.fill }} />
                      <span className="text-gray-600">{d.name}</span>
                      <span className="font-semibold text-gray-800">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[160px] text-xs text-gray-400">
                No comment threads yet
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
