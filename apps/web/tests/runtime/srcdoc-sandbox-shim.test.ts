// End-to-end verification for the #1403 fix: an HTML artifact whose
// React tree reads `localStorage` / `sessionStorage` during initial
// render used to throw `SecurityError` in the sandboxed preview
// iframe and unmount, because the URL-load path runs raw HTML under
// `sandbox="allow-scripts"` (no `allow-same-origin`) where the
// browser's real Web Storage access is rejected.
//
// PR #1306 landed the narrower fix: artifacts whose source matches
// `htmlNeedsSandboxShim()` are routed through `buildSrcdoc()`, which
// injects a Web Storage polyfill *before* any user script runs. This
// file exists to prove the fix end-to-end by:
//
//   1. Composing a real-shape React artifact that reads localStorage
//      from a `useState` initializer (the exact repro in #1403's
//      summary).
//   2. Running the produced srcDoc string through a sandboxed VM
//      context whose `window` raises `SecurityError` on every
//      Web Storage touch — modeling the browser's `allow-scripts`
//      iframe behavior, which jsdom's default `window.localStorage`
//      does not simulate on its own.
//   3. Asserting (a) the shim takes over `window.localStorage` /
//      `window.sessionStorage`, and (b) the user script reads/writes
//      without throwing.
//
// Closing the loop on the original report — the routing decision is
// already covered by `file-viewer-render-mode.test.ts`; this file
// covers the runtime payload the routing decision delivers.

import { describe, expect, it } from 'vitest';
import * as vm from 'node:vm';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

// Pull every <script> body out of a doc in document order. Lets us
// run the shim and the user script under the same fake-sandbox window
// without spinning up a real iframe.
function extractScriptBodies(doc: string): string[] {
  const bodies: string[] = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(doc)) !== null) {
    bodies.push(match[1] ?? '');
  }
  return bodies;
}

// Build a VM context that models an `allow-scripts` sandbox iframe:
// `window` is its own globalThis and native `localStorage` /
// `sessionStorage` accessors throw `SecurityError` on read.
//
// `vm.createContext` does not preserve `Object.defineProperty`
// descriptors that we install from outside, so we install the
// throwing getters from *inside* the VM after the context exists —
// that way V8 keeps the accessor semantics intact and a later
// `Object.defineProperty(window, 'localStorage', ...)` from the shim
// can override them normally.
function createSandboxedIframeVmContext(): vm.Context {
  const ctx = vm.createContext({});
  vm.runInContext(
    `(function () {
       this.window = this;
       this.globalThis = this;
       this.document = { addEventListener: function () {} };
       for (var name of ['localStorage', 'sessionStorage']) {
         (function (n) {
           Object.defineProperty(window, n, {
             configurable: true,
             get: function () {
               var err = new Error('SecurityError');
               err.name = 'SecurityError';
               throw err;
             },
           });
         })(name);
       }
     }).call(this);`,
    ctx,
  );
  return ctx;
}

describe('buildSrcdoc shim isolates Web Storage from a sandboxed window (#1403 verify)', () => {
  // Real-shape React prototype: useState initializer reads localStorage,
  // i18next-style cookie/storage detector, and an external `<script>`
  // (which on its own forces the shim path per #2361). This mirrors the
  // repro #1403's summary describes ("React app whose `useState`
  // initializer reads from `localStorage`").
  const REACT_ARTIFACT = `<!doctype html>
<html>
  <head><meta charset="utf-8"></head>
  <body>
    <div id="root"></div>
    <script type="text/babel" src="app.jsx"></script>
    <script>
      // Inline boot code: read theme + locale, write a session marker.
      var theme = localStorage.getItem('theme') || 'system';
      var lang = sessionStorage.getItem('locale') || 'en';
      localStorage.setItem('boot:last', String(Date.now()));
      window.__bootResult = { theme: theme, lang: lang, ok: true };
    </script>
  </body>
</html>`;

  it('injects the Web Storage shim into the srcDoc output', () => {
    const doc = buildSrcdoc(REACT_ARTIFACT);
    // The shim ships under a stable marker attribute so the host can
    // sanity-check that it landed without a brittle string search.
    expect(doc).toContain('data-od-sandbox-shim');
  });

  it('places the shim BEFORE the user script so the polyfill is in place at first read', () => {
    const doc = buildSrcdoc(REACT_ARTIFACT);
    const shimIdx = doc.indexOf('data-od-sandbox-shim');
    const userBootIdx = doc.indexOf('var theme = localStorage.getItem');
    expect(shimIdx).toBeGreaterThan(0);
    expect(userBootIdx).toBeGreaterThan(0);
    // Ordering is the whole point — a shim that ran after the user's
    // first read would not save the React tree from the initial
    // SecurityError.
    expect(shimIdx).toBeLessThan(userBootIdx);
  });

  it('the shim plus the user script run cleanly when the host window forbids native Web Storage (the #1403 sandbox model)', () => {
    const doc = buildSrcdoc(REACT_ARTIFACT);
    const scripts = extractScriptBodies(doc);
    // Skip the type="text/babel" tag — its body is empty (just src=)
    // and Babel-standalone is not present in the VM. We only need the
    // shim + the inline boot script to validate the SecurityError
    // suppression model.
    const shimScript = scripts.find((s) => /data-od-sandbox-shim/.test(s) === false && /makeStore/.test(s));
    const bootScript = scripts.find((s) => /var theme = localStorage\.getItem/.test(s));
    expect(shimScript, 'shim script body must be present').toBeDefined();
    expect(bootScript, 'user boot script body must be present').toBeDefined();

    const ctx = createSandboxedIframeVmContext();
    // 1. Confirm the bare sandbox raises SecurityError on Web Storage
    //    access — without this the test would not actually be modeling
    //    the iframe behavior the fix is supposed to neutralize.
    expect(() => vm.runInContext('window.localStorage.getItem("x");', ctx)).toThrow(/SecurityError/);

    // 2. Run the shim. After this, window.localStorage / sessionStorage
    //    must point at the in-memory polyfill rather than the throwing
    //    accessor.
    vm.runInContext(shimScript as string, ctx);
    const ls = vm.runInContext('window.localStorage', ctx) as { getItem: (k: string) => string | null };
    const ss = vm.runInContext('window.sessionStorage', ctx) as { setItem: (k: string, v: string) => void };
    expect(typeof ls.getItem).toBe('function');
    expect(typeof ss.setItem).toBe('function');

    // 3. Run the original boot script. It must complete without
    //    throwing — the exact failure mode #1403 reports. The script
    //    uses bare `localStorage` identifiers (no `window.` prefix),
    //    which the VM now resolves to `win.localStorage` because the
    //    sandbox window is its own globalThis.
    vm.runInContext(bootScript as string, ctx);
    const result = vm.runInContext('window.__bootResult', ctx) as { theme: string; lang: string; ok: boolean };
    expect(result.ok).toBe(true);
    expect(result.theme).toBe('system');
    expect(result.lang).toBe('en');
    // And the writes the boot script issued landed in the in-memory store.
    expect(ls.getItem('boot:last')).toMatch(/^\d+$/);
  });

  it('the shim preserves a working native localStorage when one is already present (no clobber on environments that allow Web Storage)', () => {
    // PR #1306 round-2 review point: the shim must only replace the
    // window storage when the native one is broken. Iframes loaded
    // with `allow-same-origin` (or anywhere outside the sandbox) keep
    // their real, persistent storage so the user's data survives the
    // shim.
    const doc = buildSrcdoc(REACT_ARTIFACT);
    const scripts = extractScriptBodies(doc);
    const shimScript = scripts.find((s) => /makeStore/.test(s));
    expect(shimScript).toBeDefined();

    const realStorage = (() => {
      const data: Record<string, string> = { theme: 'dark' };
      return {
        getItem: (k: string) => (k in data ? data[k]! : null),
        setItem: (k: string, v: string) => {
          data[k] = String(v);
        },
        removeItem: (k: string) => {
          delete data[k];
        },
        clear: () => {
          for (const k of Object.keys(data)) delete data[k];
        },
        key: (i: number) => Object.keys(data)[i] ?? null,
        get length() {
          return Object.keys(data).length;
        },
      };
    })();
    const win: Record<string, unknown> = {
      localStorage: realStorage,
      sessionStorage: realStorage,
      document: { addEventListener: () => {} },
    };
    const ctx = vm.createContext({ window: win, document: win.document, console });
    vm.runInContext(shimScript as string, ctx);
    // The host-supplied storage survives — the shim's `works = true`
    // branch leaves it alone.
    const survived = vm.runInContext('window.localStorage.getItem("theme")', ctx);
    expect(survived).toBe('dark');
  });

  it('captures native Web Storage writes in the navigation snapshot', () => {
    const doc = buildSrcdoc(`<!doctype html>
<html>
  <body>
    <script>
      localStorage.setItem('auth', '1');
      sessionStorage.setItem('tab', 'current');
      window.location.replace('index.html');
    </script>
  </body>
</html>`);
    const scripts = extractScriptBodies(doc);
    const shimScript = scripts.find((s) => /makeStore/.test(s));
    const loginScript = scripts.find((s) => /auth/.test(s) && /index\.html/.test(s));
    expect(shimScript, 'shim script body must be present').toBeDefined();
    expect(loginScript, 'rewritten login script body must be present').toBeDefined();

    function nativeStore() {
      const data: Record<string, string> = {};
      return {
        getItem: (k: string) => (k in data ? data[k]! : null),
        setItem: (k: string, v: string) => {
          data[k] = String(v);
        },
        removeItem: (k: string) => {
          delete data[k];
        },
        clear: () => {
          for (const k of Object.keys(data)) delete data[k];
        },
        key: (i: number) => Object.keys(data)[i] ?? null,
        get length() {
          return Object.keys(data).length;
        },
      };
    }

    const messages: unknown[] = [];
    const ctx = vm.createContext({
      localStorage: nativeStore(),
      sessionStorage: nativeStore(),
      parent: { postMessage: (message: unknown) => messages.push(message) },
      location: { href: 'about:srcdoc' },
      name: 'AUTH_OK',
      document: { addEventListener: () => {} },
      console,
    });
    vm.runInContext('window = this; globalThis = this;', ctx);
    vm.runInContext(shimScript as string, ctx);
    vm.runInContext(loginScript as string, ctx);

    expect(messages).toEqual([
      {
        type: 'od:open-file-request',
        name: 'index.html',
        snapshot: {
          localStorage: { auth: '1' },
          sessionStorage: { tab: 'current' },
          windowName: 'AUTH_OK',
        },
      },
    ]);
  });

  it('rewrites same-frame .html location.replace calls through the sandbox navigation bridge', () => {
    const doc = buildSrcdoc(`<!doctype html>
<html>
  <head><meta charset="utf-8"></head>
  <body>
    <script>
      function login() {
        window.name = 'AUTH_OK';
        localStorage.setItem('auth', '1');
        location.replace('index.html');
      }
      login();
    </script>
  </body>
</html>`);
    expect(doc).toContain('window.__odNavigateHtml("index.html")');

    const scripts = extractScriptBodies(doc);
    const shimScript = scripts.find((s) => /makeStore/.test(s));
    const loginScript = scripts.find((s) => /AUTH_OK/.test(s));
    expect(shimScript, 'shim script body must be present').toBeDefined();
    expect(loginScript, 'rewritten login script body must be present').toBeDefined();

    const messages: unknown[] = [];
    const ctx = vm.createContext({
      parent: {
        postMessage: (message: unknown) => {
          messages.push(message);
        },
      },
      location: { href: 'about:srcdoc' },
      name: '',
      document: { addEventListener: () => {} },
      console,
    });
    vm.runInContext('window = this; globalThis = this;', ctx);
    vm.runInContext(shimScript as string, ctx);
    vm.runInContext(loginScript as string, ctx);

    expect(messages).toEqual([
      {
        type: 'od:open-file-request',
        name: 'index.html',
        snapshot: {
          localStorage: { auth: '1' },
          sessionStorage: {},
          windowName: 'AUTH_OK',
        },
      },
    ]);
  });

  it('rewrites common same-frame .html navigation spellings before user scripts run', () => {
    const doc = buildSrcdoc(`<!doctype html>
<html>
  <body>
    <script>
      location.replace('index.html');
      window.location.assign("settings.html");
      location.href = 'login.html';
      window.location = "dashboard.html#main";
    </script>
  </body>
</html>`);

    expect(doc).toContain('window.__odNavigateHtml("index.html")');
    expect(doc).toContain('window.__odNavigateHtml("settings.html")');
    expect(doc).toContain('window.__odNavigateHtml("login.html")');
    expect(doc).toContain('window.__odNavigateHtml("dashboard.html#main")');
    expect(doc).not.toContain("location.replace('index.html')");
    expect(doc).not.toContain('window.location.assign("settings.html")');
    expect(doc).not.toContain("location.href = 'login.html'");
    expect(doc).not.toContain('window.location = "dashboard.html#main"');
  });

  it('gives scripts a virtual current .html URL for auth guards in srcdoc', () => {
    const doc = buildSrcdoc(`<!doctype html>
<html>
  <body>
    <script>
      if (window.location.href.indexOf('login.html') === -1) {
        window.location.replace('login.html');
      }
      window.__path = window.location.pathname;
    </script>
  </body>
</html>`, { currentFileName: 'login.html' });

    expect(doc).toContain("window.__odVirtualLocation.href.indexOf('login.html')");
    expect(doc).toContain('window.__odVirtualLocation.pathname');

    const scripts = extractScriptBodies(doc);
    const shimScript = scripts.find((s) => /buildVirtualLocation/.test(s));
    const guardScript = scripts.find((s) => /__path/.test(s));
    expect(shimScript, 'shim script body must be present').toBeDefined();
    expect(guardScript, 'guard script body must be present').toBeDefined();

    const messages: unknown[] = [];
    const ctx = vm.createContext({
      parent: { postMessage: (message: unknown) => messages.push(message) },
      location: { href: 'about:srcdoc' },
      name: '',
      document: { addEventListener: () => {} },
      console,
    });
    vm.runInContext('window = this; globalThis = this;', ctx);
    vm.runInContext(shimScript as string, ctx);
    vm.runInContext(guardScript as string, ctx);

    expect(messages).toEqual([]);
    expect(vm.runInContext('window.__path', ctx)).toBe('/login.html');
  });

  it('does not rewrite navigation-looking text inside JS strings or comments', () => {
    const doc = buildSrcdoc(`<!doctype html>
<html>
  <body>
    <script>
      var example = "location.replace('index.html')";
      var template = \`window.location.assign("settings.html")\`;
      var nested = router.location.href;
      // location.href = 'login.html';
      /* window.location = "dashboard.html"; */
      location.replace('real.html');
    </script>
  </body>
</html>`);

    expect(doc).toContain(`var example = "location.replace('index.html')"`);
    expect(doc).toContain('var template = `window.location.assign("settings.html")`');
    expect(doc).toContain('var nested = router.location.href;');
    expect(doc).toContain("// location.href = 'login.html';");
    expect(doc).toContain('/* window.location = "dashboard.html"; */');
    expect(doc).toContain('window.__odNavigateHtml("real.html")');
  });
});
