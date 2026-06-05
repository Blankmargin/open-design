import type { ChatMessage } from '../types';
import { isMultiFileArtifactType, summarizeMultiFileArtifact } from '../artifacts/multifile';

const ARTIFACT_OPEN_RE = /<artifact\b([^>]*)>/gi;
const RAW_HTML_RE = /^\s*(?:<!doctype\s+html\b|<html\b)/i;

export function compactPriorAssistantArtifactContent(content: string): string {
  const artifactCompacted = compactArtifactBlocks(content);
  return compactRawHtmlArtifact(artifactCompacted);
}

export function compactMessageContentForModel(message: ChatMessage): string {
  return message.role === 'assistant'
    ? compactPriorAssistantArtifactContent(message.content)
    : message.content;
}

function compactArtifactBlocks(content: string): string {
  let output = '';
  let cursor = 0;
  ARTIFACT_OPEN_RE.lastIndex = 0;

  while (true) {
    const open = ARTIFACT_OPEN_RE.exec(content);
    if (!open) break;
    const openStart = open.index;
    const openEnd = ARTIFACT_OPEN_RE.lastIndex;
    const closeStart = content.indexOf('</artifact>', openEnd);
    if (closeStart === -1) break;

    output += content.slice(cursor, openStart);
    const attrs = open[1] ?? '';
    const artifactBody = content.slice(openEnd, closeStart);
    output += isMultiFileArtifactType(readAttr(attrs, 'type') ?? '')
      ? summarizeMultiFileArtifact(artifactBody)
      : artifactPlaceholder(attrs);
    cursor = closeStart + '</artifact>'.length;
    ARTIFACT_OPEN_RE.lastIndex = cursor;
  }

  if (cursor === 0) return content;
  output += content.slice(cursor);
  return output.trim();
}

function compactRawHtmlArtifact(content: string): string {
  if (!RAW_HTML_RE.test(content)) return content;
  return '[raw HTML artifact omitted from prior assistant turn; full content is available in project files.]';
}

function artifactPlaceholder(attrs: string): string {
  const type = readAttr(attrs, 'type');
  const title = readAttr(attrs, 'title');
  const identifier = readAttr(attrs, 'identifier');
  const details = [
    type ? `type=${type}` : '',
    title ? `title="${title}"` : '',
    identifier ? `identifier=${identifier}` : '',
  ].filter(Boolean);
  return `[artifact omitted from prior assistant turn${details.length > 0 ? `: ${details.join(', ')}` : ''}; full content is available in project files.]`;
}

function readAttr(attrs: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const match = re.exec(attrs);
  const value = match?.[1] ?? match?.[2] ?? '';
  return value.trim() || null;
}
