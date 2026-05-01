# Intent Tree API Reference

This document provides practical `curl` examples and response samples for the current REST API.

## Conventions

- Base URL: `http://localhost:3000`
- Success envelope:

```json
{
  "ok": true,
  "data": {},
  "llm_raw": null
}
```

- Error envelope:

```json
{
  "ok": false,
  "error": "Human-readable message"
}
```

- `llm_raw` is populated only for endpoints that invoke the LLM.

## Phase 1

### Get current spec

```bash
curl -s http://localhost:3000/api/phase1/spec | jq
```

### Send message (Prompt 1)

```bash
curl -s -X POST http://localhost:3000/api/phase1/message \
  -H 'Content-Type: application/json' \
  -d '{"message":"We need a URL shortener with sub-50ms redirect latency."}' | jq
```

Prompt 1 context currently includes:

- Full current Phase 1 spec fields
- List of currently empty fields
- Latest unresolved conflicts from the most recent conflict check
- Latest user message

Sample success payload (`data`):

```json
{
  "message": "Updated constraints and latency target. What QPS should we design for?",
  "spec": {
    "id": "phase1-spec",
    "problem_statement": "...",
    "hard_constraints": "...",
    "locked": false
  },
  "clean": false,
  "conflicts": []
}
```

### Send message — streaming (Prompt 1, SSE)

```bash
curl -N -X POST http://localhost:3000/api/phase1/message/stream \
  -H 'Content-Type: application/json' \
  -d '{"message":"We need a URL shortener."}'
```

Same as `/api/phase1/message` but returns a Server-Sent Events stream. Each event is a `data:` line with a JSON token chunk. The final chunk contains the complete response.

### Run conflict check (Prompt 2)

```bash
curl -s -X POST http://localhost:3000/api/phase1/conflict-check | jq
```

This endpoint also refreshes the in-memory unresolved-conflicts snapshot that Prompt 1 receives on subsequent `/api/phase1/message` calls.

### Lock Phase 1

```bash
curl -s -X POST http://localhost:3000/api/phase1/lock | jq
```

## Phase 2 Stack

### Get current stack/session

```bash
curl -s http://localhost:3000/api/phase2/stack | jq
```

The stack follows the PRD growing-log model: there is no upfront stack proposal/approval API.
`GET /api/phase2/stack` is read-only inspection of the current accumulated stack state.

## Phase 2 Layer

### Get existing definition by depth

```bash
curl -s http://localhost:3000/api/phase2/layer/0/definition | jq
```

### Generate definition (Prompt 3 in PRD)

```bash
curl -s -X POST http://localhost:3000/api/phase2/layer/0/definition/generate | jq
```

### Approve definition

```bash
curl -s -X POST http://localhost:3000/api/phase2/layer/0/definition/approve \
  -H 'Content-Type: application/json' \
  -d '{"layer_name":"System","responsibility_scope":"Overall platform responsibilities","considerations":"Latency, availability","out_of_scope":"UI polish","checklist_template":"[\"Correctness\",\"SLO compliance\"]"}' | jq
```

### Get existing nodes by depth

```bash
curl -s http://localhost:3000/api/phase2/layer/0/nodes | jq
```

### Get edges by depth

```bash
curl -s http://localhost:3000/api/phase2/layer/0/edges | jq
```

### Propose nodes (Prompt 4 in PRD)

```bash
curl -s -X POST http://localhost:3000/api/phase2/layer/0/nodes/propose | jq
```

### Approve nodes

```bash
curl -s -X POST http://localhost:3000/api/phase2/layer/0/nodes/approve | jq
```

## State Inspection

### Session + spec + stack

```bash
curl -s http://localhost:3000/api/state/session | jq
```

### Full timeline

```bash
curl -s http://localhost:3000/api/state/timeline | jq
```

### Node event history

```bash
curl -s http://localhost:3000/api/state/node/node-auth/history | jq
```

### Pending nodes

```bash
curl -s http://localhost:3000/api/state/nodes/pending | jq
```

### Invalidated nodes

```bash
curl -s http://localhost:3000/api/state/nodes/invalidated | jq
```

### Layer status

```bash
curl -s http://localhost:3000/api/state/layer/0/status | jq
```

## Dev Utilities

These endpoints are blocked when `NODE_ENV=production`.

### Reset app data

```bash
curl -s -X POST http://localhost:3000/api/dev/reset | jq
```

### Seed demo Phase 1 + phase2 session

```bash
curl -s -X POST http://localhost:3000/api/dev/seed | jq
```

This `api/dev/seed` endpoint seeds a locked Phase 1 + phase2 session baseline for maintenance/demo flows.

### Script-based local seeding

Script commands in `package.json` currently behave as follows:

- `npm run db:seed`: resets DB and seeds only the `ProblemSpec` (unlocked)
- `npm run phase1skip`: currently same behavior as `db:seed` (spec-only, unlocked)

## Quick smoke flow

Run this sequence from an empty dev DB:

```bash
curl -s -X POST http://localhost:3000/api/dev/reset | jq
curl -s http://localhost:3000/api/phase1/spec | jq
curl -s -X POST http://localhost:3000/api/phase1/message -H 'Content-Type: application/json' -d '{"message":"Build a URL shortener"}' | jq
curl -s -X POST http://localhost:3000/api/phase1/conflict-check | jq
curl -s -X POST http://localhost:3000/api/phase1/lock | jq
curl -s http://localhost:3000/api/phase2/stack | jq
curl -s -X POST http://localhost:3000/api/phase2/layer/0/definition/generate | jq
curl -s -X POST http://localhost:3000/api/phase2/layer/0/definition/approve -H 'Content-Type: application/json' -d '{}' | jq
curl -s -X POST http://localhost:3000/api/phase2/layer/0/nodes/propose | jq
curl -s -X POST http://localhost:3000/api/phase2/layer/0/nodes/approve | jq
# (validate individual nodes, then...)
curl -s -X POST http://localhost:3000/api/phase2/layer/0/validate/edges | jq
```

## Phase 2 Validation

### Validate a single node (Prompt 5)

```bash
curl -s -X POST http://localhost:3000/api/phase2/layer/0/validate/node/L0-url-shortener | jq
```

### Edge validation (Prompt 10)

```bash
curl -s -X POST http://localhost:3000/api/phase2/layer/0/validate/edges | jq
```

Returns `{ passed: boolean, edge_results: [{ source, target, passed, issues }], missing_edges: [{ source, target, rationale, suggested_interface, suggested_direction }] }`.

### Collective vertical check (Prompt 6)

```bash
curl -s -X POST http://localhost:3000/api/phase2/layer/0/validate/collective | jq
```

### Syntax check (rule-based, no LLM)

```bash
curl -s -X POST http://localhost:3000/api/phase2/layer/0/validate/syntax | jq
```

### Lock layer

```bash
curl -s -X POST http://localhost:3000/api/phase2/layer/0/lock | jq
```

## Phase 2 Leaf Determination

### Determine leaf nodes (LLM)

```bash
curl -s -X POST http://localhost:3000/api/phase2/layer/0/leaf/determine | jq
```

### Confirm leaf nodes (with optional overrides)

```bash
curl -s -X POST http://localhost:3000/api/phase2/layer/0/leaf/confirm \
  -H 'Content-Type: application/json' \
  -d '{"overrides": {"L0-url-shortener": "leaf"}}' | jq
```

Body: `{ "overrides": { nodeId: "leaf" | "decompose_further" } }`. Omit `overrides` or pass empty body to accept LLM determination as-is.

## Phase 2 Exit Check and Lock

### Exit check — are all non-leaf nodes decomposed?

```bash
curl -s http://localhost:3000/api/phase2/exit-check | jq
```

Returns `{ complete: boolean, decompose_further_ids: string[] }`.

### Lock Phase 2

```bash
curl -s -X POST http://localhost:3000/api/phase2/lock | jq
```

Requires exit check to be complete.

## Phase 2 Failure Handling

### Diagnose a failed node (Prompt 7)

```bash
curl -s -X POST http://localhost:3000/api/phase2/diagnose/L0-url-shortener | jq
```

### Confirm or override diagnosis

```bash
curl -s -X POST http://localhost:3000/api/phase2/diagnose/L0-url-shortener/confirm \
  -H 'Content-Type: application/json' \
  -d '{}' | jq
```

Pass `{ classification, origin_nodes, suggested_action }` fields to override. Empty body confirms as-is. If `classification` is `"design"` and `origin_nodes` is non-empty, upward traversal fires automatically.

### Rewrite a node (Prompt 8 — implementation error repair)

```bash
curl -s -X POST http://localhost:3000/api/phase2/diagnose/L0-url-shortener/rewrite | jq
```

No body. Requires a prior `node_validation_failed` event for the node. Rewrites `intent`, `inputs`, and `outputs` based on failed checklist items, then auto-revalidates. Returns `{ rewritten: { intent, inputs, outputs }, validation: { passed, results[] } }`.

### Upward traversal

```bash
curl -s -X POST http://localhost:3000/api/phase2/traverse/upward \
  -H 'Content-Type: application/json' \
  -d '{"origin_nodes": ["L0-url-shortener"]}' | jq
```
