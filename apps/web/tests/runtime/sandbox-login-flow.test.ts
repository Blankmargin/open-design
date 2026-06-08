// End-to-end verification that a generated demo login survives the
// sandbox preview's cross-file navigation.
//
// The bug: after `login.html` navigated to `index.html`, the sandbox
// bridge posted a storage snapshot, but the host consumed (and nulled)
// it on the INTERMEDIATE render — the one where the navigated file's
// source has not loaded yet — so the real `index.html` rendered with no
// auth state, `checkAuth()` returned false, and the guard bounced back
// to `login.html`. Real files (download) never hit this because they
// have real storage + real navigation.
//
// This test drives the real pipeline:
//   1. buildSrcdoc(login.html) -> the inline nav is rewritten to the
//      bridge; running it (with the shared auth.js) captures the
//      od:open-file-request snapshot the host receives.
//   2. The host keys that snapshot to `index.html` and resolves it via
//      resolvePreviewStorageSnapshot — first on an intermediate empty
//      render (must NOT consume), then on the real render (consumes +
//      seeds).
//   3. buildSrcdoc(index.html, { initStorage }) is run; checkAuth()
//      must be true and the guard must NOT post a bounce to login.html.
// A control case shows that without the seeded snapshot the guard does
// bounce — i.e. the snapshot is what keeps login working.

import { describe, expect, it } from 'vitest';
import * as vm from 'node:vm';
import {
  buildSrcdoc,
  resolvePreviewStorageSnapshot,
  type PreviewStorageSnapshot,
  type SandboxShimInit,
} from '../../src/runtime/srcdoc';

// Shared demo auth helper — the canonical pattern the generation rules
// recommend: window.name set unconditionally, guard checks it first.
const AUTH_JS = `
var AUTH_KEY = 'authed';
function setAuth(){ window.name = AUTH_KEY; try { localStorage.setItem(AUTH_KEY, '1'); } catch(_){} }
function checkAuth(){ if (window.name === AUTH_KEY) return true; try { if (localStorage.getItem(AUTH_KEY) === '1') return true; } catch(_){} return false; }
`;

const LOGIN_HTML = `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body>
  <form id="f"><input id="u" autofocus><input id="p" type="password"></form>
  <script src="js/auth.js"></script>
  <script>
    // The real page does this in a submit handler; we inline the effect.
    setAuth();
    window.location.href = 'index.html';
  </script>
</body></html>`;

const INDEX_HTML = `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body>
  <h1>Dashboard</h1>
  <script src="js/auth.js"></script>
  <script>
    if (!checkAuth()) { window.location.href = 'login.html'; }
  </script>
</body></html>`;

// A DOM stub that never throws: any property access returns a callable
// no-op proxy. Lets buildSrcdoc's injected boot scripts run in the VM
// without a real jsdom tree.
function noopNode(): any {
  const fn = function () {
    return noopNode();
  };
  return new Proxy(fn, {
    get(_t, prop) {
      if (prop === 'style' || prop === 'classList' || prop === 'dataset') return noopNode();
      if (prop === Symbol.toPrimitive || prop === 'toString') return () => '';
      return noopNode();
    },
    apply() {
      return noopNode();
    },
  });
}

function fakeDocument(): any {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'getElementById' || prop === 'querySelector') return () => null;
        if (prop === 'querySelectorAll') return () => [];
        return noopNode();
      },
    },
  );
}

function inlineScriptBodies(doc: string): string[] {
  const bodies: string[] = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc)) !== null) {
    if (/\bsrc\s*=/i.test(m[1] ?? '')) continue; // external scripts have no inline body here
    bodies.push(m[2] ?? '');
  }
  return bodies;
}

// Run a page's shim + auth.js + its (rewritten) inline scripts in a VM
// that models the sandboxed iframe. Returns the captured navigation
// targets the page posted to the host.
function runPage(doc: string, initWindowName: string): string[] {
  const navTargets: string[] = [];
  const ctx: any = vm.createContext({
    parent: {
      postMessage: (msg: any) => {
        if (msg && msg.type === 'od:open-file-request') navTargets.push(msg.name);
      },
    },
    location: { href: 'about:srcdoc', replace() {}, assign() {} },
    name: initWindowName,
    console,
    document: fakeDocument(),
    addEventListener() {},
    removeEventListener() {},
  });
  vm.runInContext('window = this; globalThis = this;', ctx);
  const bodies = inlineScriptBodies(doc);
  const shim = bodies.find((b) => /makeStore/.test(b));
  if (!shim) throw new Error('sandbox shim not found');
  vm.runInContext(shim, ctx);
  vm.runInContext(AUTH_JS, ctx); // models <script src="js/auth.js">
  for (const b of bodies) {
    if (b === shim) continue;
    if (/lastTrustedInputAt|__odInspect|od:srcdoc-transport|selection-bridge/i.test(b)) continue;
    vm.runInContext(b, ctx);
  }
  const authed = vm.runInContext('checkAuth()', ctx) as boolean;
  return navTargets.concat(authed ? ['__authed__'] : []);
}

describe('sandbox login flow survives cross-file navigation', () => {
  it('keeps auth across the login -> index jump despite an intermediate empty render', () => {
    // Page 1: login. The inline location.href is rewritten to the bridge.
    const loginDoc = buildSrcdoc(LOGIN_HTML, { initStorage: null });
    expect(loginDoc).toContain('window.__odNavigateHtml("index.html")');

    const navTargets: any[] = [];
    const ctx: any = vm.createContext({
      parent: { postMessage: (msg: any) => navTargets.push(msg) },
      location: { href: 'about:srcdoc', replace() {}, assign() {} },
      name: '',
      console,
      document: fakeDocument(),
      addEventListener() {},
      removeEventListener() {},
    });
    vm.runInContext('window = this; globalThis = this;', ctx);
    const loginBodies = inlineScriptBodies(loginDoc);
    const loginShim = loginBodies.find((b) => /makeStore/.test(b))!;
    vm.runInContext(loginShim, ctx);
    vm.runInContext(AUTH_JS, ctx);
    for (const b of loginBodies) {
      if (b === loginShim) continue;
      if (/lastTrustedInputAt|__odInspect|od:srcdoc-transport/i.test(b)) continue;
      vm.runInContext(b, ctx);
    }

    const msg = navTargets.find((m) => m?.type === 'od:open-file-request');
    expect(msg?.name).toBe('index.html');
    const snapshot = msg.snapshot as SandboxShimInit;
    expect(snapshot.windowName).toBe('authed');
    expect(snapshot.localStorage).toEqual({ authed: '1' });

    // Host: key the snapshot to its destination, then resolve it twice.
    const pending: PreviewStorageSnapshot = { file: 'index.html', snapshot };

    // (a) intermediate render — index.html source still loading. Must NOT
    // consume; the ref has to survive for the real render.
    const intermediate = resolvePreviewStorageSnapshot(pending, 'index.html', false);
    expect(intermediate.consume).toBe(false);
    expect(intermediate.initStorage).toBeNull();

    // (b) real render — source ready, file matches. Consumes + seeds.
    const real = resolvePreviewStorageSnapshot(pending, 'index.html', true);
    expect(real.consume).toBe(true);
    expect(real.initStorage).toEqual(snapshot);

    // Page 2: index.html built with the seeded snapshot. The guard must
    // see auth and NOT bounce back to login.html.
    const indexDoc = buildSrcdoc(INDEX_HTML, { initStorage: real.initStorage });
    const result = runPage(indexDoc, snapshot.windowName ?? '');
    expect(result).toContain('__authed__'); // checkAuth() === true
    expect(result).not.toContain('login.html'); // no bounce
  });

  it('control: without the seeded snapshot the guard bounces back to login (the old bug)', () => {
    const indexDoc = buildSrcdoc(INDEX_HTML, { initStorage: null });
    const result = runPage(indexDoc, '');
    expect(result).not.toContain('__authed__');
    expect(result).toContain('login.html'); // exactly the broken behavior we fixed
  });
});
