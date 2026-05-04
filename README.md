# lacing-ui

React/TypeScript frontend for [lacing](https://github.com/thorwhalen/lacing) — a
standoff, interval-keyed annotation system for time-based media.

## Quick start

```bash
npm install
npm run codegen   # regenerate Zod from lacing's JSON Schema artifacts
npm run dev       # MSW-mocked backend (default — works offline)
npm run dev:real  # talks to a running uvicorn lacing.server:app on :8000
```

## Stack

- **Vite + React 19 + TypeScript strict**
- **Biome** for lint and format (replaces ESLint + Prettier)
- **Vitest + React Testing Library** + one Playwright smoke test (later)
- **[zodal](https://github.com/thorwhalen/zodal)** for storage / API / UI
  abstractions: `defineCollection`, `DataProvider<T>`,
  `toFormConfig` / `toColumnDefs`, `createShadcnRegistry()`.
- **[command-wrapex](https://github.com/thorwhalen/wrapex)** for command
  dispatch — every user action is a `defineCommand({ id, label, schema, execute })`.
- **shadcn/ui** primitives (vendored, not an npm dep), **lucide-react** icons.
- **wavesurfer.js v7** for audio, **dnd-timeline** + `@tanstack/react-virtual`
  for the multitrack body, **react-hook-form** for inspector forms.

See `../t/lacing/misc/docs/Phase 3 Frontend Plan.md` for the WHAT and
`Frontend UI for Multitrack Time-Interval Annotation Editors.md` for the WHY.

## Codegen

The Pydantic model in the lacing Python repo is the single source of truth.
JSON Schema artifacts are committed under `lacing/schema/` in the Python repo;
`npm run codegen` reads them and writes Zod into `src/types/generated/`.

To regenerate the JSON Schema artifacts (in the lacing Python repo):

```bash
python -c "from lacing.schema import export_json_schemas; export_json_schemas('lacing/schema/')"
```

Both sides — JSON Schema and Zod — are committed.

## Backend modes

- **Default (`npm run dev`)** — MSW intercepts `/api/*` in the browser and
  serves a deterministic in-memory store. No Python required.
- **Real (`npm run dev:real`)** — Vite proxies `/api/*` to
  `http://localhost:8000` (a running `uvicorn lacing.server:app`).
- **Tests (`npm test`)** — MSW always on; the setup file in
  `tests/setup.ts` boots the mock server and resets handlers per test.

## Layout

```
src/
  domain/            zodal collections + Zod schemas
  store/             zodal DataProviders (lacing-rest, factories)
  commands/          (Phase 3.3) wrapex command registry
  ui/                (Phase 3.4+) shell, palette, inspector, timeline
  mocks/             MSW handlers + browser/server setup
  types/generated/   codegened Zod (DO NOT hand-edit)
```
