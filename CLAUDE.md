# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

Base template for Ronald's projects. Spanish is the working language.

## Commands

```sh
npm run dev      # dev server (Turbopack) on http://localhost:3000
npm run build    # production build — the only full type check available
npm run lint     # ESLint (flat config, eslint.config.mjs)
npm test         # Vitest watch mode
npx vitest run path/to/file.test.ts  # single test file, one run
npx shadcn@latest add <component>   # add shadcn/ui components into components/ui/
```

Vitest runs in jsdom with Testing Library; `@/` alias resolved natively via `resolve.tsconfigPaths` (no vite-tsconfig-paths, no @vitejs/plugin-react — its latest version requires Babel 8 and conflicts with shadcn's Babel 7). Async Server Components are unit tested by invoking them as a function and awaiting the result (`render(await Component())`; see `app/page.test.tsx`), mocking server-only dependencies with `vi.mock`. `await Component()` resolves the root component; nested async Server Components may need mocks (e.g. mock the child), other techniques or integration/E2E tests.

## Project rules: `docs/SETUP.md`

Read `docs/SETUP.md` before writing code. It is the source of truth for:
1. Folder structure — domain modules in `modules/<domain>/`, `app/` only routes, English names, naming conventions per file type.
2. Best practices — SOLID/DRY/KISS/YAGNI; before creating any component, hook or function, check it doesn't already exist in the project or in shadcn/ui.
3. Methodology — build mode vs SDD, spec template, reviewer checklist, which code needs unit tests.

## Workflow: SDD agents (`.claude/agents/`)

| Agent | Role |
|---|---|
| `orchestrator` | Classifies each request as READ-ONLY, BUILD, SDD-LITE or SDD-ADVANCED (see `docs/SETUP.md` §3); plans, delegates, runs tasks in parallel when files don't overlap. Never writes code. |
| `product` | Functional UAT validator, ASISTIDA mode (`tools: Read, Glob, Grep, Bash`; `Bash` limited to a read-only allowlist enforced by the hook). Runs only as the main agent, Claude Code only: `claude --agent product`. Guides tests, records results, prepares the evidence package; never writes files or publishes to GitHub/Linear. Behavior and command catalog: single source `docs/uat/product-agent.md`. |
| `spec` | Writes `docs/specs/<module>-<feature>.md` with a task plan (≤ 5 tasks / ~15 files per phase). Never approves specs. |
| `developer` | Implements an approved spec task or a build-mode change, with tests. Checks `Estado: aprobado` before touching files; never modifies `docs/specs/` (enforced by a hook in its frontmatter). |
| `reviewer` | Doesn't edit files. Validates against the spec/task and `docs/SETUP.md`, including governance changes in the real diff; returns APROBADO, numbered OBSERVACIONES or BLOQUEADO, looping with `developer` (max 3 cycles). |

Run the full flow with `claude --agent orchestrator` (it must be the main thread: subagents can't spawn subagents). Details in `docs/SETUP.md` §3.

**Human approval is a hard blocker.** No SDD implementation starts until the user writes exactly **"apruebo docs/specs/<slug>.md"** in the chat and signs the spec's statement with their SSH key in their own terminal; neither step is ever done by Claude. It covers only the spec's current phase and never authorizes governance files (`.claude/` except plans, projects and worktrees, `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, `.mcp.json`, `docs/SETUP.md`); those also need **"autorizo gobierno docs/specs/<slug>.md"**. Never infer approval, never mark a spec approved, never edit a ledger, and don't work around a block; `Modo: build` doesn't unlock sensitive paths. Claude may only write specs with `Estado: borrador`. The user may edit code directly; these rules bind Claude. Full mechanism, limits and residual risks: `docs/SETUP.md` §3. Enforced by `.claude/hooks/spec-approval.mjs` (tests: `npx vitest run .claude/hooks`).

UAT and requested changes: see the subsection "UAT y cambios solicitados" in `docs/SETUP.md` §3; operational template in `docs/forms/uat.md`.

## Stack

- Next.js 16 App Router (`app/`), React 19, TypeScript strict. Path alias `@/*` → repo root.
- Tailwind CSS v4 via `@tailwindcss/postcss`. No `tailwind.config.*` — theme tokens live in `app/globals.css` (`@theme inline` + CSS variables, `.dark` variant).
- shadcn/ui, style `base-nova`, built on **Base UI (`@base-ui/react`)**, not Radix. Icons: `lucide-react`. Config in `components.json`.
- `cn()` comes from the `cn` package (shadcn's replacement for clsx + tailwind-merge), re-exported from `lib/utils.ts`.
- Installed but not yet wired: axios, `@tanstack/react-query` (needs a `QueryClientProvider` client component in `app/layout.tsx` before use), `@tanstack/react-table` v9, zod v4, zustand v5.
- Next 16 typed route helpers are global (e.g. `LayoutProps<"/">`), generated into `.next/types` by dev/build.
