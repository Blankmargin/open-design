import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ProjectFile } from '@open-design/contracts';
import { describe, expect, it } from 'vitest';

import { buildProjectOutline, extractHtmlDetails } from '../src/project-context-summary.js';

describe('buildProjectOutline', () => {
  it('summarizes HTML structure without embedding full source', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'od-outline-'));
    const html = [
      '<!doctype html>',
      '<html>',
      '<head><title>Video Security Console</title></head>',
      '<body>',
      '<header id="topbar"><a href="cockpit.html">大屏</a></header>',
      '<nav class="sidebar"><a href="login.html">登录</a></nav>',
      '<main id="dashboard"><section id="devices"><button aria-label="退出账号">退出</button></section></main>',
      '<form id="loginForm" action="/login"><input name="phone"><input name="password"></form>',
      '<script>const secretSource = "do not include this exact source";</script>',
      '</body>',
      '</html>',
    ].join('');
    await writeFile(path.join(dir, 'index.html'), html, 'utf8');

    const outline = await buildProjectOutline(
      dir,
      [
        projectFile('index.html', html.length, 'html', {
          artifactManifest: {
            version: 1,
            entry: 'index.html',
            kind: 'html',
            renderer: 'html',
            exports: ['html'],
            title: 'Security Admin',
          },
        }),
      ],
    );

    expect(outline).toContain('Project outline');
    expect(outline).toContain('read only the target file(s)');
    expect(outline).toContain('create a separate HTML file');
    expect(outline).toContain('index.html');
    expect(outline).toContain('title "Video Security Console"');
    expect(outline).toContain('header#topbar');
    expect(outline).toContain('section#devices');
    expect(outline).toContain('links cockpit.html, login.html');
    expect(outline).toContain('buttons "退出"');
    expect(outline).toContain('forms #loginForm action=/login fields=phone,password');
    expect(outline).toContain('title "Security Admin"');
    expect(outline).not.toContain('do not include this exact source');
  });

  it('skips sidecars, marks oversized HTML, and respects output budget', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'od-outline-'));
    await mkdir(path.join(dir, 'assets'), { recursive: true });
    await writeFile(path.join(dir, 'huge.html'), '<!doctype html><html><body>large source</body></html>', 'utf8');

    const outline = await buildProjectOutline(
      dir,
      [
        projectFile('huge.html', 1_000_000, 'html'),
        projectFile('huge.html.artifact.json', 20, 'code'),
        projectFile('assets/logo.png', 2048, 'image'),
      ],
      { maxHtmlBytes: 100, maxOutputChars: 720 },
    );

    expect(outline).toContain('huge.html');
    expect(outline).toContain('too large to summarize inline');
    expect(outline).toContain('assets/logo.png');
    expect(outline).not.toContain('.artifact.json');
    expect(outline.length).toBeLessThanOrEqual(800);
  });
});

describe('extractHtmlDetails', () => {
  it('extracts title, structure, links, buttons, and forms', () => {
    const details = extractHtmlDetails(
      [
        '<title>Login</title>',
        '<main id="login"><form id="account"><input name="username"></form></main>',
        '<a href="index.html">Back</a><button>Submit</button>',
      ].join(''),
    );

    expect(details.join('; ')).toContain('title "Login"');
    expect(details.join('; ')).toContain('main#login');
    expect(details.join('; ')).toContain('links index.html');
    expect(details.join('; ')).toContain('buttons "Submit"');
    expect(details.join('; ')).toContain('forms #account fields=username');
  });
});

function projectFile(
  name: string,
  size: number,
  kind: ProjectFile['kind'],
  extra: Partial<ProjectFile> = {},
): ProjectFile {
  return {
    name,
    path: name,
    type: 'file',
    size,
    mtime: 1,
    kind,
    mime: kind === 'html' ? 'text/html' : 'application/octet-stream',
    ...extra,
  };
}
