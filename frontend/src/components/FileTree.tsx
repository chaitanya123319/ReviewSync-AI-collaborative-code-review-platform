import { useState, useMemo } from 'react';

/* ─── Types ─── */
export interface FileEntry {
  id: string;
  filename: string;
  path: string;
  language: string;
  createdAt: string;
}

interface TreeNode {
  name: string;
  fullPath: string;
  children: TreeNode[];
  file: FileEntry | null;
}

interface FileTreeProps {
  files: FileEntry[];
  activeFileId: string | null;
  onFileSelect: (fileId: string) => void;
}

/* ─── Language icon map ─── */
const LANG_ICONS: Record<string, string> = {
  javascript: '🟨',
  typescript: '🔷',
  python: '🐍',
  markdown: '📝',
  json: '{}',
  html: '🌐',
  css: '🎨',
  plaintext: '📄',
};

function getIcon(language: string): string {
  return LANG_ICONS[language] || '📄';
}

/* ─── Build tree from flat file list ─── */
function buildTree(files: FileEntry[]): TreeNode[] {
  const root: TreeNode = { name: '', fullPath: '', children: [], file: null };

  for (const file of files) {
    const parts = file.path ? file.path.split('/') : [];
    let current = root;

    // Create/find folder nodes
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const fullPath = parts.slice(0, i + 1).join('/');
      let child = current.children.find((c) => c.name === part && !c.file);
      if (!child) {
        child = { name: part, fullPath, children: [], file: null };
        current.children.push(child);
      }
      current = child;
    }

    // Add file leaf
    current.children.push({
      name: file.filename,
      fullPath: file.path ? `${file.path}/${file.filename}` : file.filename,
      children: [],
      file,
    });
  }

  // Sort: folders first (alphabetical), then files (alphabetical)
  function sortNodes(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      const aIsFolder = !a.file;
      const bIsFolder = !b.file;
      if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children.length > 0) sortNodes(node.children);
    }
  }

  sortNodes(root.children);
  return root.children;
}

/* ─── Folder Node ─── */
function FolderNode({
  node,
  depth,
  activeFileId,
  onFileSelect,
  defaultOpen,
}: {
  node: TreeNode;
  depth: number;
  activeFileId: string | null;
  onFileSelect: (fileId: string) => void;
  defaultOpen: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        <svg
          className={`w-3 h-3 flex-shrink-0 text-gray-400 transition-transform duration-150 ${
            isOpen ? 'rotate-90' : ''
          }`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-sm">{isOpen ? '📂' : '📁'}</span>
        <span className="truncate">{node.name}</span>
      </button>

      {isOpen && (
        <div>
          {node.children.map((child) =>
            child.file ? (
              <FileNode
                key={child.file.id}
                node={child}
                depth={depth + 1}
                activeFileId={activeFileId}
                onFileSelect={onFileSelect}
              />
            ) : (
              <FolderNode
                key={child.fullPath}
                node={child}
                depth={depth + 1}
                activeFileId={activeFileId}
                onFileSelect={onFileSelect}
                defaultOpen={defaultOpen}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

/* ─── File Node ─── */
function FileNode({
  node,
  depth,
  activeFileId,
  onFileSelect,
}: {
  node: TreeNode;
  depth: number;
  activeFileId: string | null;
  onFileSelect: (fileId: string) => void;
}) {
  const file = node.file!;
  const isActive = file.id === activeFileId;

  return (
    <button
      onClick={() => onFileSelect(file.id)}
      className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-xs transition-colors ${
        isActive
          ? 'bg-indigo-50 text-indigo-700 border-l-2 border-l-indigo-500'
          : 'text-gray-700 hover:bg-gray-100'
      }`}
      style={{ paddingLeft: `${8 + (depth + 1) * 14}px` }}
      title={node.fullPath}
    >
      <span className="text-sm flex-shrink-0">{getIcon(file.language)}</span>
      <span className="truncate font-mono">{node.name}</span>
    </button>
  );
}

/* ─── Main FileTree Component ─── */
export default function FileTree({ files, activeFileId, onFileSelect }: FileTreeProps) {
  const tree = useMemo(() => buildTree(files), [files]);

  // Check if any file in a subtree is active (to auto-expand)
  const hasActiveDescendant = useMemo(() => {
    if (!activeFileId) return false;
    const active = files.find((f) => f.id === activeFileId);
    return !!active;
  }, [files, activeFileId]);

  return (
    <div className="py-1">
      {tree.map((node) =>
        node.file ? (
          <FileNode
            key={node.file.id}
            node={node}
            depth={0}
            activeFileId={activeFileId}
            onFileSelect={onFileSelect}
          />
        ) : (
          <FolderNode
            key={node.fullPath}
            node={node}
            depth={0}
            activeFileId={activeFileId}
            onFileSelect={onFileSelect}
            defaultOpen={hasActiveDescendant || true}
          />
        ),
      )}
    </div>
  );
}
