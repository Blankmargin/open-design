export const MULTI_FILE_ARTIFACT_TYPE = 'application/vnd.open-design.files+json';

export interface MultiFileArtifactFile {
  name: string;
  content: string;
}

export interface MultiFileArtifactPayload {
  entry?: string;
  files: MultiFileArtifactFile[];
}

export type MultiFileArtifactResult =
  | { ok: true; payload: MultiFileArtifactPayload }
  | { ok: false; reason: string };

const MAX_FILES = 80;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const FORBIDDEN_EXACT_NAMES = new Set([
  '.env',
  '.env.local',
  '.gitignore',
]);
const FORBIDDEN_PREFIXES = [
  '.git/',
  '.github/',
  '.ssh/',
  'node_modules/',
];

export function isMultiFileArtifactType(type: string | undefined): boolean {
  return (type ?? '').trim().toLowerCase() === MULTI_FILE_ARTIFACT_TYPE;
}

export function parseMultiFileArtifact(content: string): MultiFileArtifactResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, reason: 'multi-file artifact must contain valid JSON' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'multi-file artifact must be a JSON object' };
  }
  const record = parsed as Record<string, unknown>;
  const rawFiles = normalizeRawFiles(record.files);
  if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
    return { ok: false, reason: 'multi-file artifact must include a non-empty files array' };
  }
  if (rawFiles.length > MAX_FILES) {
    return { ok: false, reason: `multi-file artifact exceeds the file limit (${MAX_FILES})` };
  }

  const files: MultiFileArtifactFile[] = [];
  const seen = new Set<string>();
  let totalBytes = 0;
  for (const item of rawFiles) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, reason: 'each multi-file entry must be an object' };
    }
    const file = normalizeRawFileEntry(item as Record<string, unknown>);
    if (!file) {
      return {
        ok: false,
        reason:
          'each multi-file entry must include a string name/path and string content/html',
      };
    }
    const nameResult = normalizeProjectFileName(file.name);
    if (!nameResult.ok) return nameResult;
    if (seen.has(nameResult.name)) {
      return { ok: false, reason: `duplicate file in multi-file artifact: ${nameResult.name}` };
    }
    seen.add(nameResult.name);
    const bytes = new TextEncoder().encode(file.content).byteLength;
    if (bytes > MAX_FILE_BYTES) {
      return { ok: false, reason: `file ${nameResult.name} exceeds the size limit` };
    }
    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_BYTES) {
      return { ok: false, reason: 'multi-file artifact exceeds the total size limit' };
    }
    files.push({ name: nameResult.name, content: file.content });
  }

  const entry = typeof record.entry === 'string' && record.entry.trim()
    ? normalizeProjectFileName(record.entry)
    : null;
  if (entry && !entry.ok) return entry;
  if (entry && !seen.has(entry.name)) {
    return { ok: false, reason: `entry file is not present in files: ${entry.name}` };
  }
  const hasIndex = seen.has('index.html');
  if (!hasIndex && files.length > 1) {
    return { ok: false, reason: 'multi-file prototype artifacts must include index.html' };
  }

  return {
    ok: true,
    payload: {
      ...(entry?.ok ? { entry: entry.name } : {}),
      files,
    },
  };
}

export function chooseMultiFileEntry(payload: MultiFileArtifactPayload): string {
  if (payload.entry) return payload.entry;
  if (payload.files.some((file) => file.name === 'index.html')) return 'index.html';
  return payload.files.find((file) => /\.html?$/i.test(file.name))?.name ?? payload.files[0]?.name ?? '';
}

export function summarizeMultiFileArtifact(content: string): string {
  const parsed = parseMultiFileArtifact(content);
  if (!parsed.ok) return '[multi-file artifact omitted from prior assistant turn; file list unavailable.]';
  const entry = chooseMultiFileEntry(parsed.payload);
  const names = parsed.payload.files.map((file) => file.name).slice(0, 12).join(', ');
  const omitted = parsed.payload.files.length > 12
    ? `, +${parsed.payload.files.length - 12} more`
    : '';
  return `[multi-file artifact omitted from prior assistant turn: entry=${entry || '(none)'}; files=${names}${omitted}]`;
}

function normalizeRawFiles(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return null;
  return Object.entries(value as Record<string, unknown>).map(([name, content]) => ({
    name,
    content,
  }));
}

function normalizeRawFileEntry(entry: Record<string, unknown>): MultiFileArtifactFile | null {
  const name = firstString(entry, ['name', 'path', 'file', 'filename', 'fileName']);
  const content = firstString(entry, ['content', 'html', 'source', 'code', 'text', 'body']);
  if (!name || content === null) return null;
  return { name, content };
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') return value;
  }
  return null;
}

function normalizeProjectFileName(input: string):
  | { ok: true; name: string }
  | { ok: false; reason: string } {
  const name = input.trim().replace(/\\/g, '/').replace(/\/+/g, '/');
  const lower = name.toLowerCase();
  if (!name) return { ok: false, reason: 'file name must not be empty' };
  if (name.startsWith('/') || /^[a-z]:\//i.test(name)) {
    return { ok: false, reason: `file path must be project-relative: ${input}` };
  }
  if (name.split('/').some((part) => part.length === 0)) {
    return { ok: false, reason: `file path must not contain empty segments: ${input}` };
  }
  if (name.split('/').some((part) => part === '..' || part === '.')) {
    return { ok: false, reason: `file path must not contain traversal segments: ${input}` };
  }
  if (FORBIDDEN_EXACT_NAMES.has(lower) || FORBIDDEN_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
    return { ok: false, reason: `file path is not allowed: ${input}` };
  }
  if (name.split('/').some((part) => part.startsWith('.') && part !== '.well-known')) {
    return { ok: false, reason: `hidden file paths are not allowed: ${input}` };
  }
  return { ok: true, name };
}
