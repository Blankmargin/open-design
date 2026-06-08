import { describe, expect, it } from 'vitest';

import { composeSystemPrompt } from '../src/prompts/system.js';
import { DISCOVERY_AND_PHILOSOPHY } from '../src/prompts/discovery.js';

// Guard: the contracts copy of DISCOVERY_AND_PHILOSOPHY must have the same
// cap removal as apps/daemon/src/prompts/discovery.ts. The web app imports
// composeSystemPrompt from @open-design/contracts, so only testing the daemon
// copy leaves the web-originated chat path unguarded.
describe('DISCOVERY_AND_PHILOSOPHY (contracts copy) — TodoWrite plan item count', () => {
  it('does not cap the plan at 10 items via "5–10" wording', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).not.toMatch(/5[–\-]10\s+short\s+imperative/);
  });

  it('does not cap the plan at 10 items via "5 to 10" wording', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).not.toMatch(/5 to 10\s+(?:short\s+)?items/i);
  });

  it('does not re-introduce a numeric cap via "at most / maximum / no more than" phrasing', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).not.toMatch(
      /(?:at most|maximum|no more than)\s+1[0-9]\s+(?:todo|plan|step|item)/i,
    );
  });

  it('still instructs the agent to write a TodoWrite plan', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('TodoWrite');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('RULE 3');
  });

  it('also absent from the composed system prompt', () => {
    const prompt = composeSystemPrompt({});
    expect(prompt).not.toMatch(/5[–\-]10\s+short\s+imperative/);
  });
});

describe('composeSystemPrompt', () => {
  it('injects Chinese quick brief guidance when the UI locale is zh-CN', () => {
    const prompt = composeSystemPrompt({ locale: 'zh-CN' });

    expect(prompt).toContain('# UI locale override');
    expect(prompt).toContain('`zh-CN` (Simplified Chinese)');
    expect(prompt).toContain('快速简报 — 30 秒');
    expect(prompt).toContain('目标用户');
    expect(prompt).toContain('视觉调性');
    expect(prompt).toContain('Keep machine-readable ids and object option `value` fields exact and unlocalized');
  });

  it('preserves canonical default task-type options under locale overrides', () => {
    const prompt = composeSystemPrompt({ locale: 'zh-CN' });

    expect(prompt).toContain(
      'keep the `taskType` option labels as the canonical routing choices',
    );
    for (const option of [
      'Prototype',
      'Live artifact',
      'Slide deck',
      'Image',
      'Video',
      'HyperFrames',
      'Audio',
      'Other',
    ]) {
      expect(prompt).toContain(`"${option}"`);
    }
    expect(prompt).not.toContain('option labels as `原型`');
    expect(prompt).not.toContain('`实时作品`');
  });

  it('preserves canonical default task-type options for zh-TW locale overrides', () => {
    const prompt = composeSystemPrompt({ locale: 'zh-TW' });

    expect(prompt).toContain('# UI locale override');
    expect(prompt).toContain('`zh-TW` (Traditional Chinese)');
    expect(prompt).toContain(
      'keep the `taskType` option labels as the canonical routing choices',
    );
    for (const option of [
      'Prototype',
      'Live artifact',
      'Slide deck',
      'Image',
      'Video',
      'HyperFrames',
      'Audio',
      'Other',
    ]) {
      expect(prompt).toContain(`"${option}"`);
    }
    expect(prompt).not.toContain('快速简报 — 30 秒');
    expect(prompt).not.toContain('option labels as `原型`');
    expect(prompt).not.toContain('`实时作品`');
  });

  it('treats an active design system as the visual direction', () => {
    const prompt = composeSystemPrompt({
      designSystemTitle: 'ComfyUI',
      designSystemBody: '# ComfyUI\n\n--accent: #ffd500',
      metadata: { kind: 'prototype' } as any,
      activeStageBlocks: [
        '\n\n## Active stage: plan\n\n### direction-picker\n\nAsk for 3-5 directions.',
      ],
    });

    expect(prompt).toContain('## Active design system — ComfyUI');
    expect(prompt).toContain('Active design system exception');
    expect(prompt).toContain(
      'the active design system is the visual direction for this project',
    );
    expect(prompt).toContain('Do not ask the user to pick a separate theme color');
    expect(prompt).toContain('Do not emit a direction question-form');
    expect(prompt).not.toContain('<question-form id="direction"');
    expect(prompt.indexOf('## Active design system visual direction')).toBeGreaterThan(
      prompt.indexOf('### direction-picker'),
    );
  });

  it('requires index.html as the entry for multi-page prototypes', () => {
    const prompt = composeSystemPrompt({
      metadata: { kind: 'prototype', fidelity: 'production' } as any,
    });

    expect(prompt).toContain('**index-entry rule**');
    expect(prompt).toContain('MUST include an `index.html` entry file');
    expect(prompt).toContain('`index.html` is the stable launcher/directory');
    expect(prompt).toContain('Put the real screen layout, interaction markup, and page-specific styling in those child files');
    expect(prompt).toContain('overview/KPI boards');
    expect(prompt).toContain('create it as a child file such as `overview.html` or `dashboard.html`');
    expect(prompt).toContain('**index-link contract**');
    expect(prompt).toContain('<a href="devices.html">设备管理</a>');
    expect(prompt).toContain('Do not add `target="_blank"` to internal project HTML links');
    expect(prompt).toContain('OD previews run inside an iframe');
    expect(prompt).toContain('Do not implement index navigation with `onclick`');
    expect(prompt).toContain('hidden `.page-section` panels');
    expect(prompt).toContain('**shared-asset rule**');
    expect(prompt).toContain('css/app.css');
    expect(prompt).toContain('customers.html');
    expect(prompt).toContain('analytics.html');
    expect(prompt).toContain('logs.html');
  });

  it('treats index.html as navigation glue for follow-up prototype edits', () => {
    const prompt = composeSystemPrompt({
      metadata: { kind: 'prototype', fidelity: 'production' } as any,
    });

    expect(prompt).toContain('**follow-up child-page edit rule**');
    expect(prompt).toContain('treat `index.html` as navigation glue only');
    expect(prompt).toContain('create a new descriptive child HTML file');
    expect(prompt).toContain('update `index.html` only to add its link');
  });

  it('requires shared shell controls to be updated across child pages', () => {
    const prompt = composeSystemPrompt({
      metadata: { kind: 'prototype', fidelity: 'production' } as any,
    });

    expect(prompt).toContain('**shared-shell consistency rule**');
    expect(prompt).toContain('大屏驾驶舱 beside notifications/help');
    expect(prompt).toContain('include every affected child HTML file in `files[]`');
    expect(prompt).toContain('Do not add the control only to `index.html` or only to the active page');
  });

  it('requires login/auth flows to run in sandboxed previews', () => {
    const prompt = composeSystemPrompt({
      metadata: { kind: 'prototype', fidelity: 'production' } as any,
    });

    expect(prompt).toContain('**demo-auth rule**');
    expect(prompt).toContain('prototype login/auth screens are for clickable demos');
    expect(prompt).toContain('do NOT implement real backend login, OAuth, cookies');
    expect(prompt).toContain('Use a mock front-end-only flow');
    expect(prompt).toContain('accepts any non-empty email/username + password');
    expect(prompt).toContain('Do NOT create fixed credential arrays or whitelist checks');
    expect(prompt).toContain('`VALID_CREDENTIALS`');
    expect(prompt).toContain('`admin/admin123`');
    expect(prompt).toContain('**auth-flow runnable rule**');
    expect(prompt).toContain('login/auth is only complete when it works across files');
    expect(prompt).toContain('real `handleLogin(event)`');
    expect(prompt).toContain('equivalent mock handler');
    expect(prompt).toContain('calls `event.preventDefault()`');
    expect(prompt).toContain('Every page that calls a shared auth function must load that shared auth script first');
    expect(prompt).toContain('`login.html` MUST include `<script src="js/auth.js"></script>` before its inline submit handler');
    expect(prompt).toContain('Do NOT `return` after writing `localStorage` or `sessionStorage`');
    expect(prompt).toContain('polyfill `localStorage` / `sessionStorage` in memory');
    expect(prompt).toContain('data is lost when navigating between HTML files');
    expect(prompt).toContain('`window.name` unconditionally as the primary cross-page mechanism');
    expect(prompt).toContain('Do NOT put the `window.name` write inside a `catch` block');
    expect(prompt).toContain('check `window.name` first on every guard call');
    expect(prompt).toContain('before any `localStorage` or `sessionStorage` read');
    expect(prompt).toContain('Do NOT put `window.name` checks only inside `catch`');
    expect(prompt).toContain('Do NOT rely on `?auth=1`, `?redirect=...`');
    expect(prompt).toContain('Open Design srcDoc previews strip query/hash during file navigation');
    expect(prompt).toContain('navigate in the same frame to a plain file path');
    expect(prompt).toContain('Do NOT use `window.top.location`, `window.parent.location`, `window.open`');
  });

  it('requires visible interactive controls to be runnable, not decorative', () => {
    const prompt = composeSystemPrompt({
      metadata: { kind: 'prototype', fidelity: 'production' } as any,
    });

    expect(prompt).toContain('**interactive-control runnable rule**');
    expect(prompt).toContain('every visible interactive control must work in the preview');
    expect(prompt).toContain('Do not ship `href="#"`, `javascript:void(0)`');
    expect(prompt).toContain('undefined inline handlers');
    expect(prompt).toContain('toast-only fake actions');
  });
});
