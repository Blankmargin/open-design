import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { type ProjectFile } from '@open-design/contracts';
import { load } from 'cheerio';

export interface ProjectOutlineOptions {
  maxFiles?: number;
  maxHtmlBytes?: number;
  maxOutputChars?: number;
  maxItemsPerGroup?: number;
}

const DEFAULT_MAX_FILES = 40;
const DEFAULT_MAX_HTML_BYTES = 256 * 1024;
const DEFAULT_MAX_OUTPUT_CHARS = 8 * 1024;
const DEFAULT_MAX_ITEMS_PER_GROUP = 8;

const TEXT_TAG_SELECTOR = [
  'button',
  'a[role="button"]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
].join(',');

export async function buildProjectOutline(
  projectDir: string,
  files: readonly ProjectFile[],
  options: ProjectOutlineOptions = {},
): Promise<string> {
  const maxFiles = positiveInt(options.maxFiles, DEFAULT_MAX_FILES);
  const maxHtmlBytes = positiveInt(options.maxHtmlBytes, DEFAULT_MAX_HTML_BYTES);
  const maxOutputChars = positiveInt(options.maxOutputChars, DEFAULT_MAX_OUTPUT_CHARS);
  const maxItemsPerGroup = positiveInt(options.maxItemsPerGroup, DEFAULT_MAX_ITEMS_PER_GROUP);
  const visibleFiles = files
    .filter((file) => file.type !== 'dir' && !file.name.endsWith('.artifact.json'))
    .slice(0, maxFiles);

  if (visibleFiles.length === 0) {
    return 'This folder is empty. Choose a clear, descriptive filename for whatever you create.';
  }

  const lines: string[] = [
    'Project outline (compact; do NOT overwrite unless the user asks):',
    '- Use this outline to choose target files, then read only the target file(s) before editing.',
    '- For new navigable screens/routes such as login, auth, settings, detail, report, checkout, or a data cockpit, create a separate HTML file and link to it from the existing page.',
    '- Avoid merging new screens into an already large single HTML file unless the user explicitly asks for a single-file artifact.',
  ];

  for (const file of visibleFiles) {
    if (lines.join('\n').length >= maxOutputChars) break;
    if (file.kind === 'html') {
      lines.push(await summarizeHtmlFile(projectDir, file, { maxHtmlBytes, maxItemsPerGroup }));
    } else {
      lines.push(summarizeNonHtmlFile(file));
    }
  }

  if (files.length > visibleFiles.length) {
    lines.push(`- ... ${files.length - visibleFiles.length} more file(s) omitted from this compact outline.`);
  }

  return truncateBlock(lines.join('\n'), maxOutputChars);
}

async function summarizeHtmlFile(
  projectDir: string,
  file: ProjectFile,
  options: { maxHtmlBytes: number; maxItemsPerGroup: number },
): Promise<string> {
  const base = `- ${file.name} (${formatBytes(file.size)}, html${manifestTitle(file)})`;
  if (file.size > options.maxHtmlBytes) {
    return `${base}: too large to summarize inline; read this file before editing it.`;
  }

  try {
    const html = await readFile(path.join(projectDir, file.name), 'utf8');
    const details = extractHtmlDetails(html, options.maxItemsPerGroup);
    if (details.length === 0) return `${base}: no major structure detected.`;
    return `${base}: ${details.join('; ')}`;
  } catch {
    return `${base}: could not read for summary; read this file before editing it.`;
  }
}

export function extractHtmlDetails(html: string, maxItemsPerGroup = DEFAULT_MAX_ITEMS_PER_GROUP): string[] {
  const $ = load(html);
  const details: string[] = [];
  const title = cleanText($('title').first().text());
  if (title) details.push(`title "${limitText(title, 80)}"`);

  const sections = collectUnique(
    $('header, nav, aside, main, section, footer, form')
      .toArray()
      .map((node) => {
        const el = $(node);
        const tag = String(node.tagName ?? '').toLowerCase();
        const id = cleanToken(el.attr('id'));
        const klass = cleanToken((el.attr('class') ?? '').split(/\s+/).find(Boolean));
        return id ? `${tag}#${id}` : klass ? `${tag}.${klass}` : tag;
      }),
    maxItemsPerGroup,
  );
  if (sections.length > 0) details.push(`structure ${sections.join(', ')}`);

  const links = collectUnique(
    $('a[href]')
      .toArray()
      .map((node) => cleanText($(node).attr('href') ?? ''))
      .filter((href) => href && !href.startsWith('#') && !href.toLowerCase().startsWith('javascript:')),
    maxItemsPerGroup,
  );
  if (links.length > 0) details.push(`links ${links.join(', ')}`);

  const buttons = collectUnique(
    $(TEXT_TAG_SELECTOR)
      .toArray()
      .map((node) => {
        const el = $(node);
        return cleanText(el.text() || el.attr('aria-label') || el.attr('title') || el.attr('value') || '');
      })
      .filter(Boolean),
    maxItemsPerGroup,
  );
  if (buttons.length > 0) details.push(`buttons ${buttons.map((text) => `"${limitText(text, 40)}"`).join(', ')}`);

  const forms = collectUnique(
    $('form')
      .toArray()
      .map((node) => {
        const el = $(node);
        const id = cleanToken(el.attr('id'));
        const action = cleanText(el.attr('action') ?? '');
        const fields = collectUnique(
          el.find('input[name], textarea[name], select[name]')
            .toArray()
            .map((input) => cleanToken($(input).attr('name'))),
          4,
        );
        const parts = [
          id ? `#${id}` : '',
          action ? `action=${action}` : '',
          fields.length > 0 ? `fields=${fields.join(',')}` : '',
        ].filter(Boolean);
        return parts.length > 0 ? parts.join(' ') : 'form';
      }),
    maxItemsPerGroup,
  );
  if (forms.length > 0) details.push(`forms ${forms.join(', ')}`);

  return details;
}

function summarizeNonHtmlFile(file: ProjectFile): string {
  return `- ${file.name} (${formatBytes(file.size)}, ${file.kind}${manifestTitle(file)})`;
}

function manifestTitle(file: ProjectFile): string {
  const title = file.artifactManifest?.title;
  return typeof title === 'string' && title.trim() ? `, title "${limitText(cleanText(title), 80)}"` : '';
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function cleanToken(value: string | undefined): string {
  return (value ?? '').replace(/[^\w:-]/g, '').trim();
}

function collectUnique(values: string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = cleanText(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

function positiveInt(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown size';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function limitText(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}

function truncateBlock(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 80)).trimEnd()}\n- ... project outline truncated; read target files before editing.`;
}
