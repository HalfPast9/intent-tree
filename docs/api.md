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
  "error": {
    "code": "bad_request",
    "message": "Human-readable message"
  }
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

### Run conflict check (Prompt 2)

```bash
curl -s -X POST http://localhost:3000/api/phase1/conflict-check | jq
```

### Lock Phase 1

```bash
curl -s -X POST http://localhost:3000/api/phase1/lock | jq
```

## Phase 2 Stack

### Get current stack/session

```bash
curl -s http://localhost:3000/api/phase2/stack | jq
```

### Propose stack (Prompt 3)

```bash
curl -s -X POST http://localhost:3000/api/phase2/stack/propose | jq
```

### Approve stack

```bash
curl -s -X POST http://localhost:3000/api/phase2/stack/approve \
  -H 'Content-Type: application/json' \
  -d '{"layers":[{"layer":"System","description":"Top-level system intent","reasoning":"Matches business scope"}]}' | jq
```

### Check stack evolution (Prompt 4)

```bash
curl -s -X POST http://localhost:3000/api/phase2/stack/evolution/check \
  -H 'Content-Type: application/json' \
  -d '{"depth":0}' | jq
```

### Approve stack evolution

```bash
curl -s -X POST http://localhost:3000/api/phase2/stack/evolution/approve \
  -H 'Content-Type: application/json' \
  -d '{"depth":0,"proposed_stack":[{"layer":"System","description":"Top-level system intent","reasoning":"Refined for depth 0"}]}' | jq
```

## Phase 2 Layer

### Get existing criteria by depth

```bash
curl -s http://localhost:3000/api/phase2/layer/0/criteria | jq
```

### Generate criteria (Prompt 5)

```bash
curl -s -X POST http://localhost:3000/api/phase2/layer/0/criteria/generate | jq
```

### Approve criteria

```bash
curl -s -X POST http://localhost:3000/api/phase2/layer/0/criteria/approve \
  -H 'Content-Type: application/json' \
  -d '{"layer_name":"System","responsibility_scope":"Overall platform responsibilities","considerations":"Latency, availability","out_of_scope":"UI polish","checklist_template":"[\"Correctness\",\"SLO compliance\"]"}' | jq
```

### Get existing nodes by depth

```bash
curl -s http://localhost:3000/api/phase2/layer/0/nodes | jq
```

### Propose nodes (Prompt 6)

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

## Quick smoke flow

Run this sequence from an empty dev DB:

```bash
curl -s -X POST http://localhost:3000/api/dev/reset | jq
curl -s http://localhost:3000/api/phase1/spec | jq
curl -s -X POST http://localhost:3000/api/phase1/message -H 'Content-Type: application/json' -d '{"message":"Build a URL shortener"}' | jq
curl -s -X POST http://localhost:3000/api/phase1/conflict-check | jq
curl -s -X POST http://localhost:3000/api/phase1/lock | jq
curl -s -X POST http://localhost:3000/api/phase2/stack/propose | jq
curl -s -X POST http://localhost:3000/api/phase2/stack/approve -H 'Content-Type: application/json' -d '{}' | jq
curl -s -X POST http://localhost:3000/api/phase2/layer/0/criteria/generate | jq
curl -s -X POST http://localhost:3000/api/phase2/layer/0/criteria/approve -H 'Content-Type: application/json' -d '{}' | jq
curl -s -X POST http://localhost:3000/api/phase2/layer/0/nodes/propose | jq
curl -s -X POST http://localhost:3000/api/phase2/layer/0/nodes/approve | jq
```

## Not Yet Implemented

The API design in `docs/intent-tree.md` also lists these planned endpoints, which are not implemented in the server yet:

- `POST /api/phase2/layer/:depth/validate/node/:nodeId`
- `POST /api/phase2/layer/:depth/validate/collective`
- `POST /api/phase2/layer/:depth/validate/syntax`
- `POST /api/phase2/layer/:depth/lock`
- `POST /api/phase2/diagnose/:nodeId`
- `POST /api/phase2/diagnose/:nodeId/confirm`
- `POST /api/phase2/traverse/upward`
