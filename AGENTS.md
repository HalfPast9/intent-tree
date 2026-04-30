# AGENTS.md — Intent Tree

> Compact instructions for OpenCode. When in doubt, trust executable config over prose.

## Repo Structure

- **Root** — Node/Express backend (TypeScript, Neo4j, Azure OpenAI).
- **`client/`** — React 18 + Vite frontend (TanStack Query, ReactFlow, Dagre).
- No monorepo tool, no tests, no linter, no formatter, no CI.

## Quick Commands

### Backend (root)
```bash
npm install          # one-time
npm run dev          # tsx watch, port 3000
npm run build        # tsc -> dist/
npm run start        # node dist/index.js
npm run typecheck    # tsc --noEmit

# Database (destructive; dev only)
npm run db:reset     # wipe all application nodes
npm run db:seed      # reset + seed unlocked ProblemSpec
npm run db:fresh     # reset + seed
npm run phase1skip   # same as db:seed currently
```

### Frontend (`client/`)
```bash
cd client
npm install
npm run dev          # vite dev server, port 5173 (proxies /api to :3000)
npm run build        # tsc -b && vite build -> client/dist
npm run typecheck    # tsc --noEmit
```

The backend serves `client/dist` statically; build the client before running the backend in production mode.

## Critical Conventions

### Backend Imports — `.js` Extensions Required
`tsconfig.json` uses `"moduleResolution": "NodeNext"`. **Every local import must include a `.js` extension**, even for `.ts` source files:
```ts
// Correct
import { foo } from "./db/client.js";
// Wrong
import { foo } from "./db/client";
```

### Frontend Path Alias
`client/vite.config.ts` aliases `@/` to `src/`. Use it for all internal imports:
```ts
import { Foo } from "@/components/Foo";
```

### Mixed JS/TS in `client/src/`
Many components have both `.js` and `.tsx` versions. The HTML entrypoint loads `main.tsx`. **Edit the `.tsx` files**; the `.js` files are stale remnants.

## Environment Requirements

Copy `.env.example` to `.env` and fill all values. The app crashes on boot if any are missing (`src/config/env.ts` throws).

Required:
- `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`
- `AZURE_KIMI_API_KEY`, `AZURE_KIMI_ENDPOINT`, `AZURE_KIMI_MODEL`

## Architecture Notes

- **Neo4j is the only datastore.** The backend is event-sourced: every action is an immutable `Event` node. Current state is derived from the event timeline.
- **LLM client** (`src/llm/client.ts`) calls Azure OpenAI in JSON-object mode (`response_format: { type: "json_object" }`). Temperature defaults to `0.2`.
- **API envelope** — every endpoint returns `{ ok: boolean, data: {}, llm_raw: string | null }`.
- **Phase 1** = collaborative problem-spec elicitation. **Phase 2** = layer-by-layer architecture DAG construction with validation loops.
- **Dev-only endpoints** (`/api/dev/reset`, `/api/dev/seed`) are blocked when `NODE_ENV=production`.

## Canonical References

- API contract & curl examples: `docs/api.md`
- Frontend behaviour & design tokens: `docs/frontend.md`
- System spec & prompt catalogue: `docs/intent-tree.md`
