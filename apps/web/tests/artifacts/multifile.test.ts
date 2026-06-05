import { describe, expect, it } from 'vitest';

import {
  chooseMultiFileEntry,
  MULTI_FILE_ARTIFACT_TYPE,
  parseMultiFileArtifact,
  summarizeMultiFileArtifact,
} from '../../src/artifacts/multifile';

describe('multi-file artifacts', () => {
  it('parses a valid multi-file payload', () => {
    const parsed = parseMultiFileArtifact(JSON.stringify({
      entry: 'index.html',
      files: [
        { name: 'index.html', content: '<!doctype html><html><body></body></html>' },
        { name: 'login.html', content: '<!doctype html><html><body></body></html>' },
        { name: 'css/tokens.css', content: ':root{}' },
      ],
    }));

    expect(parsed).toMatchObject({
      ok: true,
      payload: {
        entry: 'index.html',
        files: [
          { name: 'index.html' },
          { name: 'login.html' },
          { name: 'css/tokens.css' },
        ],
      },
    });
    if (parsed.ok) expect(chooseMultiFileEntry(parsed.payload)).toBe('index.html');
  });

  it('accepts common model-emitted aliases for file paths and bodies', () => {
    const parsed = parseMultiFileArtifact(JSON.stringify({
      entry: 'index.html',
      files: [
        { path: 'index.html', html: '<!doctype html><html><body>Index</body></html>' },
        { filename: 'devices.html', source: '<!doctype html><html><body>Devices</body></html>' },
        { fileName: 'css/tokens.css', code: ':root{}' },
      ],
    }));

    expect(parsed).toMatchObject({
      ok: true,
      payload: {
        files: [
          { name: 'index.html', content: expect.stringContaining('Index') },
          { name: 'devices.html', content: expect.stringContaining('Devices') },
          { name: 'css/tokens.css', content: ':root{}' },
        ],
      },
    });
  });

  it('accepts object-map files emitted by models', () => {
    const parsed = parseMultiFileArtifact(JSON.stringify({
      entry: 'index.html',
      files: {
        'index.html': '<!doctype html><html><body>Index</body></html>',
        'devices.html': '<!doctype html><html><body>Devices</body></html>',
      },
    }));

    expect(parsed).toMatchObject({
      ok: true,
      payload: {
        files: [
          { name: 'index.html', content: expect.stringContaining('Index') },
          { name: 'devices.html', content: expect.stringContaining('Devices') },
        ],
      },
    });
  });

  it('rejects unsafe paths and malformed payloads', () => {
    for (const payload of [
      { files: [] },
      { files: [{ name: '', content: 'x' }] },
      { files: [{ name: 'css/', content: 'x' }] },
      { files: [{ name: '../x.html', content: 'x' }] },
      { files: [{ name: '/tmp/x.html', content: 'x' }] },
      { files: [{ name: '.env', content: 'x' }] },
      { files: [{ name: '.git/config', content: 'x' }] },
      { files: [{ name: 'index.html', content: 1 }] },
      { files: [{ name: 'login.html', content: 'x' }, { name: 'devices.html', content: 'x' }] },
    ]) {
      expect(parseMultiFileArtifact(JSON.stringify(payload)).ok).toBe(false);
    }
  });

  it('summarizes prior multi-file artifacts without retaining file bodies', () => {
    const summary = summarizeMultiFileArtifact(JSON.stringify({
      entry: 'index.html',
      files: [
        { name: 'index.html', content: '<!doctype html><html><body>dashboard source</body></html>' },
        { name: 'devices.html', content: '<!doctype html><html><body>devices source</body></html>' },
      ],
    }));

    expect(MULTI_FILE_ARTIFACT_TYPE).toBe('application/vnd.open-design.files+json');
    expect(summary).toContain('multi-file artifact omitted');
    expect(summary).toContain('entry=index.html');
    expect(summary).toContain('files=index.html, devices.html');
    expect(summary).not.toContain('dashboard source');
  });
});
