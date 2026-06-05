# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Open Design is a local-first, open-source design tool that generates web/desktop/mobile prototypes, live dashboards, decks, images, and video. It runs on 21+ coding-agent CLIs or any OpenAI-compatible endpoint via BYOK.

Stack: Next.js 16 App Router + React 18 (web), Node 24 + Express + SSE streaming + better-sqlite3 (daemon), Electron (desktop), Vitest + Playwright (testing). Monorepo managed by pnpm workspaces.

## Architecture and workflow reference

@AGENTS.md

## Running a single test

```bash
# Package-scoped single file
pnpm --filter @open-design/daemon test -- tests/lint-artifact.test.ts
pnpm --filter @open-design/web test -- tests/components/FileViewer.test.tsx
pnpm --filter @open-design/contracts test -- tests/system-prompt.test.ts

# Filter to a single test name within a file
pnpm --filter @open-design/daemon test -- -t "auth storage fallback"

# e2e (run from e2e/ directory)
cd e2e && pnpm test tests/tools-dev/inspect.test.ts
cd e2e && pnpm test specs/mac.spec.ts
```

## Prebuild before typecheck

On a fresh clone or after structural changes, `pnpm typecheck` needs cross-package declarations to exist first:

```bash
pnpm --filter @open-design/daemon build && pnpm --filter @open-design/desktop build && pnpm --filter @open-design/web build:sidecar
pnpm typecheck
```

CI does these prebuilds automatically; locally you only need them after pulling large changes or switching branches.

## What `pnpm guard` checks

`pnpm guard` runs `scripts/guard.ts` (rejects new `.js`/`.mjs`/`.cjs` files without an explicit allowlist entry) plus policy tests: `style-policy.test.ts`, `product-neutrality.test.ts`, `approve-fork-pr-workflows.test.ts`, `postinstall.test.ts`.

## Code style

- Single quotes in JS/TS. English comments only. No narrating comments.
- `apps/web/src/` is TypeScript with React JSX. Daemon (`apps/daemon/`) is also TypeScript.
- New source files must be TypeScript. Generated `dist/*.js` is runtime output.
- No new root-level dependencies without a paragraph in the PR explaining what you get vs. what bytes ship.

## i18n

18 locales under `apps/web/src/i18n/locales/`. Every key in `apps/web/src/i18n/types.ts` must exist in all locale files or typecheck fails.

```bash
pnpm i18n:check      # verify all keys present
pnpm i18n:coverage   # coverage report
```

## TypeScript config

No shared `tsconfig.base.json` — each package owns its config independently. Node packages use `module: NodeNext`; web uses `module: ESNext` with bundler resolution. Tests use a `tsconfig.tests.json` extending the main config with `noEmit: true`.
