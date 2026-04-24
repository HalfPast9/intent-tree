# Intent Tree — Technical Specification
> V1 build target. Last updated: 2026-04-23.

---

## 1. Origin & Motivation

LLMs are powerful but undisciplined. They reason well locally but lose coherence over long problem-solving sessions — they drift, contradict themselves, and produce solutions that feel right at every step but don't hold together as a whole.

The Intent Tree framework was designed by working backwards from how a senior engineer actually solves hard problems: they don't just generate — they decompose. They break a problem into well-defined sub-problems, validate that the pieces fit together, and only drill into specifics once the structure is sound. If something breaks at a lower level, they don't patch it locally — they trace it back to its root cause.

The framework emulates this process. The decomposition and validation loop is domain-agnostic — applicable to any problem requiring structured breakdown. This specification defines the **software architecture instantiation**: nodes decompose to individual functions with typed signatures, edges resolve to API contracts, and the locked architecture hands off to a coding agent. Applying the framework to other domains (hardware design, business strategy, research planning) requires redefining leaf termination criteria and edge contract types while the core loop remains unchanged.

---

## 2. Core Concept

The system operates on a **DAG of subsystem nodes** (directed acyclic graph — nodes can have multiple parents). Each node represents a unit of solution responsibility. Nodes decompose into child nodes (vertical), and nodes at the same level connect via interface contracts (horizontal edges).

The architecture is not built in one shot. It is constructed layer by layer, with each layer validated before the next is started. Validation has two dimensions:

- **Horizontal** — do the nodes at this layer cohere with each other? Are their interface contracts well-defined?
- **Vertical** — do the nodes at this layer correctly and completely decompose their parent(s)?

The end state is a fully locked architecture where every node is well-defined, every edge is a clear contract, and every layer provably serves the one above it. At the leaf level, nodes are individual functions with typed signatures and edges are typed API contracts — the coding agent's job is pure translation, not design. This locked architecture is the artifact — it gets handed to an implementation agent (e.g. Claude Code, Copilot) for execution.

---

## 3. System Phases

The framework operates in three sequential phases. Transitions are not open-ended LLM judgment ("are we ready?") — the LLM always says yes. Transitions are gated by structured criteria the LLM checks against, with human sign-off as the final lock.

| Phase | Name | Purpose | Exit Gate |
|-------|------|---------|-----------|
| 1 | Problem Space Definition | Define the problem, constraints, and optimization targets collaboratively with the user | All 8 required fields populated + LLM conflict check + human sign-off |
| 2 | Architecture | Construct the Intent Tree architecture layer by layer, validate each layer before descending | All layers locked + syntax valid + human sign-off |
| 3 | Implementation | Handoff to external coding agent | **Deferred — not in V1** |

### Phase transitions

**Phase 1 → Phase 2:** Lightweight — the problem space doc is human-readable. LLM checks all required fields are populated and surfaces any detected conflicts between constraints, NFRs, and optimization targets. Human does final sign-off.

**Within Phase 2:** Heavier — architecture state is too complex for a human to verify at each step. Automated loop with structured human touchpoints (see Section 6).

**Phase 2 → Phase 3:** All layers locked, syntax checker passed, human signs off.

**Phase 2 can reopen Phase 1:** If architecture reveals the problem was underspecified, Phase 1 can be reopened. When Phase 1 changes, walk Phase 2 layers top-down, find the first conflict, invalidate from there downward. Untouched branches stay locked.

---

## 4. Data Structures

### 4.1 Phase 1 Output — Problem Space Spec

Phase 1 produces a **structured document, not a graph**. It sits above the architecture and becomes the root inherited context for every node and every LLM call. It is never a node itself.

Required fields:

| # | Field | Description |
|---|-------|-------------|
| 1 | Problem statement | What are we solving |
| 2 | Hard constraints | Non-negotiables — things the solution cannot violate |
| 3 | Optimization targets | What to maximize or minimize (directional, not thresholds) |
| 4 | Success criteria | How do we know the solution worked |
| 5 | Out-of-scope boundaries | What we are explicitly not solving |
| 6 | Assumptions | Things taken for granted that shape the solution space but aren't explicit constraints |
| 7 | Non-functional requirements | Hard thresholds — performance, scalability, security, reliability |
| 8 | Existing context | Current tech stack, systems that cannot change, known integrations |

**Conflict check:** Before Phase 1 locks, the LLM actively checks for conflicts between fields 2, 3, and 7 and surfaces them to the user. Unresolved conflicts must not silently carry into Phase 2.

### 4.2 Node

A node is a **subsystem** — a unit of solution responsibility. Not a task, not a step. Analogous to a component in a C4 diagram.

- Nodes exist only in Phase 2. Phase 1 has no nodes.
- A node does not produce implementation artifacts. The locked architecture is the artifact.
- A leaf node is one that contains no sub-components — only logic. It describes a single function. See Section 5 for leaf termination criteria.
- **A node can have multiple parents.** The vertical structure is a DAG, not a strict tree. Example: a PCB layout node might be a child of both mechanical design and IC selection — it must satisfy both parent intents simultaneously.

**Node schema:**

| Field | Description |
|-------|-------------|
| `id` | Depth + human-readable slug — e.g. `L2-auth-service` |
| `intent` | What this subsystem is responsible for delivering |
| `state` | `pending` / `in_progress` / `locked` / `invalidated` |
| `depth` | Layer position in the architecture DAG (root = 0) |
| `parents` | IDs of all parent nodes (one or more) |
| `children` | IDs of child nodes (next layer down) |
| `edges` | IDs of edges connecting this node to neighbours at the same depth |
| `inputs` | What this node receives — vague at upper layers, typed signature at leaf level |
| `outputs` | What this node produces — vague at upper layers, typed signature at leaf level |

**Progressive type maturity:** At upper layers, `inputs` and `outputs` are natural language descriptions ("receives user credentials"). At the leaf layer, they are typed function signatures ("receives `TokenPayload { userId: string, exp: number }`"). The schema is the same field — its precision increases as decomposition deepens.

**Context is not stored in nodes.** Inherited context (Phase 1 spec + all parents + siblings + edge-connected neighbours) is assembled at call time — not copied into each node. This keeps storage lean and makes re-validation cheap after upward traversal.

**Node creation — shared nodes:** See Section 5.1 for how shared nodes (multiple parents) are proposed, claimed, and validated.

### 4.3 Edge

An edge is an **interface contract between sibling subsystems** — not just a dependency link. It describes what is exchanged and how.

- Edges are horizontal — they connect nodes at the same layer depth, regardless of whether those nodes share a parent.
- Edges can be directed or bidirectional. Cycles within a horizontal layer are valid — circular dependencies accurately model real architectures (e.g. auth service ↔ user service).
- **No edges between layers.** Cross-layer relationships are handled through **inheritance** — a child carries its parent's intent downward through decomposition. Node relocation (moving a misplaced node to the correct depth) is deferred to a future version of the structural checker.
- Cycles in the **vertical** direction are forbidden — a node cannot be its own ancestor.

**Edge schema:**

| Field | Description |
|-------|-------------|
| `id` | Unique identifier |
| `source` | Source node ID |
| `target` | Target node ID |
| `interface` | What is exchanged and how — vague at upper layers, typed API contract at leaf level |
| `direction` | `directed` or `bidirectional` |

**Progressive type maturity:** At upper layers, `interface` is natural language ("auth service sends user data to permission service"). At the leaf layer, it is a typed contract ("POST /auth/validate, body: TokenPayload, returns: AuthResult"). Same field, increasing precision.

**Leaf-level type agreement:** At the leaf layer, a new validation check enforces consistency: the source node's declared `outputs` must match what the edge `interface` says is being transmitted, and that must match the target node's declared `inputs`. If any of the three disagree, it's a validation failure.

### 4.4 DAG Level

A level is the set of all nodes at a given depth across the entire architecture. Levels do not have their own lock state — a level is considered locked when all its nodes are locked.

### 4.5 Architecture Graph

- Root node = top-level architecture problem (depth 0)
- Root inherited context = Phase 1 spec (not a parent node — there is none at depth 0)
- **Context assembly:** The full set of available context for any LLM call includes: Phase 1 spec, all parent nodes, siblings at same depth, edge-connected neighbours at same depth, layer definition, current stack (all layers defined so far), and all existing nodes at the target depth. Each prompt type selects the subset it needs — see Section 7 for per-prompt payloads. Context is always resolved at call time, never stored.
- **Neighbours = any node connected via an edge at the same layer depth** — not limited to siblings (same parent). Cross-parent edges are valid as long as both nodes are at the same depth.
- **Multiple parents:** The vertical structure is a DAG, not a strict tree. A node can be a child of more than one parent and must satisfy all of them simultaneously.

---

## 5. Abstraction Stack & Leaf Termination

### 5.1 Abstraction Stack

The abstraction stack is a **growing log of layer definitions** — not a predefined plan. It records what layers have been defined so far, not what layers will be defined in the future.

**Rules:**
- No upfront declaration of the full stack. Before decomposing each new layer, the LLM defines only that layer — what it is, what problems it solves, what abstraction level it operates at.
- The stack is the accumulation of every layer definition produced so far. After three layers of decomposition, you can look at it and see e.g. `System → Service → Module`, but only because those three layers have been defined and decomposed — not because anyone predicted that structure at the start of Phase 2.
- Each layer definition is informed by what the previous layer's decomposition actually produced. Layer N+1's definition uses the concrete nodes at layer N as input, not a guess about what they might look like.
- Every node's context includes the current stack (all layers defined so far) and its position within it.

**Why not predefined:** Predicting the full stack at the start of Phase 2 asks the LLM to commit to structure it hasn't explored. Layer 3's definition should be informed by what layer 2's decomposition actually produced — information that doesn't exist at Phase 2 start. The growing-log approach ensures each layer definition is grounded in reality rather than prediction.

**No remap mechanism.** Because layers are never predeclared, there is nothing to remap when reality doesn't match the prediction. The only invalidation mechanism is upward traversal when validation fails (see Section 6).

### 5.2 Leaf Termination

A node is a leaf when it contains **no sub-components — only logic**. It describes a single function.

The test: **does this node need to be decomposed into parts that have relationships with each other?** If yes, it contains sub-subsystems and must decompose further. If no, it is a single block of logic — a function — and it is a leaf.

Examples:
- "Handle rate limiting" — contains token bucket logic, a counter store, a middleware hook. Three blocks that relate to each other. **Not a leaf — decompose.**
- "Increment token bucket counter" — one block. Takes a key, checks the count, increments or rejects. **Leaf.**
- "Process order" — calls validateInventory, chargePayment, sendConfirmation in sequence. That's orchestration over sub-components. **Not a leaf — decompose.**
- "Validate JWT signature" — takes a token string, decodes it, verifies the signature, returns the payload. One operation. **Leaf.**

Leaf nodes must have fully typed `inputs` and `outputs` — no vague descriptions. This is what makes the coding agent's job mechanical: here's the function, here's the input type, here's the output type, write it.

### 5.3 Shared Node Creation

When decomposing a parent, the LLM receives all nodes already existing at the target depth. It can either propose new nodes or **claim existing nodes** as children of the current parent.

**Claim as-is:** The decomposer says "I need exactly this existing node." The node gains the current parent as an additional parent. The node is re-validated against all parents' intents — if it passes, the claim succeeds.

**Claim with edits:** The decomposer says "I need this node but it also needs to handle X." Proposed edits are applied. The node is re-validated against the *original* parent(s). If it still passes for all original parents, the edit sticks and the new parent is added. If the edit would break the original parent relationship, the claim is rejected.

**Failed claims:** When a claim is rejected, the decomposer creates a separate node with similar intent. The collective vertical check (Prompt 6) will flag this as an overlap between near-identical nodes. The human then decides: revisit the claim with different edits, accept the duplication as intentional, or restructure the decomposition.

**Decomposition order matters.** The first parent to decompose anchors a node's definition. Subsequent parents must accommodate the existing definition or propose edits that don't break it. The human approves all proposals and can reorder decomposition if the ordering produces bad results.

---

## 6. Phase 2 — Layer Iteration Loop

This is the core of the framework. Each layer goes through a full loop before locking. Every layer runs the full loop — no shortcuts for shallow layers.

```
START OF LAYER
│
├─ 1. Define this layer
│       LLM defines what this layer is, based on:
│         - All parent node(s) intent at this depth
│         - Previous layer definition (from the layer above, if any)
│         - Current stack (all layers defined so far)
│         - Phase 1 spec
│       This is a LAYER DEFINITION, not just a checklist. It defines:
│         - Layer name (e.g. "Service Layer")
│         - Responsibility scope — what problems get solved at this level
│         - Considerations — what the LLM should think about when decomposing here
│         - Out of scope — what belongs above or below this layer
│       User approves or edits before loop proceeds.  ← HUMAN GATE
│
├─ 2. LLM proposes nodes for this layer
│       Each parent at the current depth decomposes separately.
│       Generates children of one parent + a node checklist for each child.
│       LLM sees all existing nodes at this depth — can claim existing
│       nodes as shared children (see Section 5.3).
│       Node checklists are generated from the layer definition as a template.
│       Repeat for each parent. User reviews node checklists.  ← HUMAN GATE
│
├─ 3. NODE ITERATION LOOP
│   │
│   ├─ LLM checks each node against its checklist:
│   │
│   │   Per-node vertical (does this node serve its parents?):
│   │     □ Node intent stays within the scope of ALL parent nodes
│   │     □ Node does not violate any Phase 1 hard constraints
│   │     □ Node does not conflict with Phase 1 optimization targets or NFRs
│   │
│   │   Collective vertical (do children together equal each parent?):
│   │     □ Each parent is fully covered by its children — no gaps, per parent
│   │     □ No two siblings overlap in responsibility
│   │   Note: collective vertical fires only when the layer is thought complete,
│   │         not on every node iteration.
│   │
│   │   Horizontal (is this node well-formed within its layer?):
│   │     □ All edges to siblings are well-defined with clear interface contracts
│   │     □ Node responsibility is atomic enough for its current abstraction layer
│   │
│   │   Type agreement (leaf layer only):
│   │     □ Source node outputs match edge interface
│   │     □ Edge interface matches target node inputs
│   │     □ All leaf nodes have fully typed inputs and outputs
│   │
│   ├─ IF PASS (all nodes pass individual checklists):
│   │     → Trigger collective vertical check
│   │     → IF PASS: proceed to syntax checker
│   │     → IF FAIL: specific gaps/overlaps returned → retry from node iteration
│   │
│   └─ IF FAIL (any node fails checklist):
│         LLM diagnoses failure type with reasoning:
│           - Implementation error → node's own definition is wrong, can be fixed locally
│           - Design error → problem originates in one or more ancestor nodes
│         User confirms or overrides diagnosis.  ← HUMAN GATE
│           - Confirmed implementation → REWRITE THIS NODE
│               LLM rewrites the node's intent, inputs, and outputs based on the
│               failed checklist items (Prompt 8). Auto-revalidates after rewrite.
│               If rewrite passes → continue. If it fails again → re-diagnose.
│           - Confirmed design → UPWARD TRAVERSAL
│               LLM identifies the origin nodes (can be anywhere from direct parents
│               to Phase 1 spec — multiple origins possible). All nodes from each
│               origin downward are invalidated.
│
├─ 4. Syntax checker (rule-based, no LLM, fully deterministic)
│       Checks structural correctness — things the iteration loop can't self-report:
│         □ No cycles in vertical decomposition (node cannot be its own ancestor)
│         □ Cycles and bidirectional edges valid within horizontal level
│         □ No edges between nodes at different depths — cross-layer relationships must use inheritance
│         □ No orphaned nodes
│         □ All edges reference valid source and target node IDs
│         □ No two sibling nodes have identical intents
│       IF FAIL → specific structural error returned → re-enter node iteration
│
└─ 5. Layer locks
        State of all nodes in layer set to `locked`.

└─ 6. Leaf determination
        LLM evaluates each locked node: does it contain sub-components
        that relate to each other, or is it a single block of logic?
        Returns `leaf` or `decompose_further` with reasoning per node.
        User confirms or overrides.  ← HUMAN GATE
        Leaf nodes must have fully typed inputs/outputs — if they don't,
        that's a validation failure sent back to step 3.

EXIT CHECK: Are there any non-leaf nodes without children?
  → YES: start next layer for those nodes (repeat from START OF LAYER)
  → NO: Phase 2 decomposition is complete. Run final syntax check,
         human signs off, Phase 2 locks.

END OF LAYER
```

**Layer definition evolution mid-loop:** If the layer definition needs updating during iteration, the updated version requires user re-approval before taking effect. The LLM cannot silently move goalposts.

---

## 7. LLM Context Design

### 7.1 What every call receives
- Full Phase 1 spec — always, on every call, no exceptions

### 7.2 Context payload by call type

Each call type receives a different payload — purpose-built, not a generic dump.

**Decomposition call** (generate child nodes for a parent)
- Format: natural language — this is a creative reasoning task
- Contents: Phase 1 spec, all parent node(s) intent, current stack (all layers defined so far) with current position marked, layer definition, all existing nodes at this depth

**Validation call** (check node against checklist)
- Format: structured — this is a comparison task, needs to be unambiguous
- Contents: Phase 1 spec, node being validated (including inputs/outputs), checklist as structured pass/fail items, siblings + edge-connected neighbours as JSON

**Diagnosis call** (classify a failure as implementation or design error)
- Format: narrative — this is a causal reasoning task
- Contents: Phase 1 spec, failed node, which checklist items failed + why, all parent nodes, siblings + edge-connected neighbours in NL

### 7.3 Prompt Catalogue

Eight distinct prompts. Each defined by what it receives, what it returns, and format.

---

**Prompt 1 — Problem space elicitation** (Phase 1, conversational)

Role: collaborative — LLM leads with structure but adapts to how the user communicates. Not a rigid interview.

Receives (per turn):
- The 8 required field schemas
- Current spec doc state (what's filled, what isn't)
- Latest unresolved conflicts from the most recent Prompt 2 run (if any)
- Conversation history

Returns (per turn):
```json
{
  "message": "conversational reply to user",
  "spec_update": {
    "field_name": "updated value"
  }
}
```

The spec doc is visible to the user and updates in real time as fields are filled. The LLM naturally probes unfilled fields through conversation — not a checklist read-out.

---

**Prompt 2 — Conflict check** (Phase 1, gate)

Fires after all 8 fields are populated. Hard stop — user must resolve all conflicts before Phase 1 can lock.

Receives:
- Complete Phase 1 spec doc

Returns:
```json
{
  "clean": true,
  "conflicts": [
    {
      "fields": ["hard_constraints", "nfrs"],
      "tension": "description of the conflict",
      "question": "clarifying question for the user to resolve it"
    }
  ]
}
```

If `clean: false` — user addresses each conflict, spec updates, prompt 2 reruns. Loop until `clean: true`.

Also checks: does the problem statement align with success criteria? Can success criteria be achieved given constraints?

---

**Prompt 3 — Layer definition** (start of each layer in Phase 2)

Defines what the next layer of abstraction is. Does not predict future layers — only defines the immediate next one based on what has been built so far.

Receives:
- Full Phase 1 spec
- Current stack (all layers defined so far)
- Parent node(s) intent — all parents if multiple
- Previous layer definition (from the layer above, if any)
- Any nodes already existing at this depth from other decompositions

Returns:
```json
{
  "layer_name": "Service Layer",
  "responsibility_scope": "what problems get solved at this level",
  "considerations": "what the LLM should think about when decomposing here",
  "out_of_scope": "what belongs above or below this layer",
  "checklist_template": [
    "checklist item text"
  ]
}
```

User approves or edits before decomposition begins. The `checklist_template` is the source of truth for all node checklists at this layer.

---

**Prompt 4 — Node + checklist proposal** (decomposition call)

All children of a single parent proposed in a single call. Each parent at the current depth decomposes separately — later parents see nodes from earlier decompositions and can claim them as shared children (see Section 5.3). Format: natural language heavy — this is a creative reasoning task.

Receives:
- Full Phase 1 spec
- Current stack + position
- Parent node(s) intent
- Layer definition
- All existing nodes at this depth (for shared node claiming — see Section 5.3)

Returns:
```json
{
  "nodes": [
    {
      "id": "L2-auth-service",
      "intent": "what this subsystem is responsible for",
      "parents": ["L1-backend"],
      "inputs": "what this node receives",
      "outputs": "what this node produces",
      "claimed_from": null,
      "proposed_edits": null,
      "checklist": [
        {
          "item": "checklist item text",
          "context": "node-specific detail for this item"
        }
      ]
    }
  ]
}
```

For claimed shared nodes: `claimed_from` contains the existing node ID, and `proposed_edits` contains any modifications (or null for claim-as-is).

User reviews node checklists before validation begins.

---

**Prompt 5 — Node validation** (validation call, per node)

Format: structured — comparison task.

Receives:
- Full Phase 1 spec
- Node being validated (id, intent, inputs, outputs, edges)
- All parent nodes
- Siblings + edge-connected neighbours
- Node checklist

Returns:
```json
{
  "passed": true,
  "results": [
    {
      "item": "checklist item text",
      "passed": true,
      "reasoning": "why this passed or failed"
    }
  ]
}
```

Full reasoning on every item, passes and failures. Feeds directly into the audit log.

At the leaf layer, checklist includes type agreement checks: source outputs ↔ edge interface ↔ target inputs.

---

**Prompt 6 — Collective vertical check** (after all nodes pass individually)

Receives:
- Full Phase 1 spec
- All parent nodes at this layer
- Full set of sibling nodes + their intents
- Layer definition

Returns:
```json
{
  "passed": false,
  "coverage": [
    {
      "parent": "L1-backend",
      "fully_covered": false,
      "gaps": ["aspect of parent intent not covered by any child"],
      "reasoning": "why this gap exists"
    }
  ],
  "overlaps": [
    {
      "nodes": ["L2-auth-service", "L2-user-service"],
      "overlap": "description of overlapping responsibility",
      "reasoning": "why this is an overlap"
    }
  ]
}
```

Overlaps here will surface near-duplicate nodes created by failed shared node claims.

---

**Prompt 7 — Failure diagnosis** (diagnosis call)

Fires on any failed node validation. Format: narrative — causal reasoning task.

Receives:
- Full Phase 1 spec
- Failed node + checklist results (which items failed + reasoning)
- All parent nodes
- Siblings + edge-connected neighbours
- Layer definition
- Current stack (all layers defined so far)

Returns:
```json
{
  "classification": "implementation",
  "reasoning": "why this is an impl or design error",
  "origin_nodes": ["L1-backend"],
  "suggested_action": "what the LLM recommends doing next"
}
```

`origin_nodes` is empty for implementation errors. For design errors it lists all nodes where the problem originates — can be one or many, each potentially tracing through a different parent chain. Upward traversal invalidates from each origin downward.

---

**Prompt 8 — Node rewrite** (implementation error repair)

Fires when a node fails validation and P7 classifies the failure as an implementation error. Rewrites the node's definition in place — no subtree invalidation. Auto-revalidates after rewriting.

Receives:
- Full Phase 1 spec
- Failed node (id, intent, inputs, outputs)
- Failed checklist results (which items failed + reasoning)
- All checklist results (for context on what passed — preserve those)
- All parent nodes
- Siblings at same depth
- Layer definition
- Current stack

Returns:
```json
{
  "intent": "rewritten intent",
  "inputs": "rewritten inputs",
  "outputs": "rewritten outputs"
}
```

Rules: only change what failed; preserve what already passed; stay within the layer's `out_of_scope`; the rewritten node must still serve every parent's intent. After the rewrite, the system auto-runs Prompt 5 on the updated node. If it fails again, the diagnosis cycle restarts.

---

## 8. Tech Stack

| Concern | Decision | Rationale |
|---------|----------|-----------|
| LLM | Kimi K2.5 via Azure | Strong reasoning; covered by student credits |
| Model routing | Single model for all call types in V1 | No premature optimization |
| Storage | Neo4j graph DB (Docker or AuraDB free tier) | Purpose-built for graph traversal; no rewrite risk later |
| State model | Full event sourcing | Every action stored as an immutable event — complete timeline of how the architecture evolved and why |
| Language | TypeScript / JavaScript | Web UI required for C4 view; locks in JS ecosystem |
| Human interface | Simple web UI (vibecoded) | C4 view requires web; editable as human escape hatch |
| Graph library | TBD — decide at first implementation session | Likely `graphology` (JS) or custom lightweight implementation |
| LLM SDK | TBD — decide at first implementation session | Direct Azure REST or OpenAI-compatible SDK |

### 8.1 Event Sourcing

Every action in the system is stored as an immutable event node in Neo4j. Current architecture state is derived from the event log. Rollback = rewind to any earlier event. The goal is a complete timeline — every event is logged, including silent passes, so there are no gaps in the audit trail.

**Base event schema:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique event ID |
| `type` | string | Event type (see catalogue below) |
| `timestamp` | datetime | When the event occurred |
| `actor` | `"llm"` \| `"human"` | Who caused the event |
| `node_ids` | string[] | IDs of architecture nodes this event affects |
| `payload` | object | Typed per event type — each type has its own schema |

**Neo4j structure:**
- Events are nodes with label `Event`
- `(:Event)-[:AFFECTS]->(:Node)` — links event to affected tree nodes
- `(:Event)-[:FOLLOWS]->(:Event)` — sequential chain for timeline reconstruction

**Example queries:**
- Full history of a node: `MATCH (e:Event)-[:AFFECTS]->(n:ArchNode {id: 'L2-auth-service'}) RETURN e ORDER BY e.timestamp`
- Full system timeline: `MATCH (e:Event) RETURN e ORDER BY e.timestamp`
- All validation failures: `MATCH (e:Event {type: 'node_validation_failed'}) RETURN e`

**Event type catalogue (~36 types):**

*Phase 1*
| Event | Actor | Description |
|-------|-------|-------------|
| `spec_field_updated` | llm \| human | A Phase 1 spec field was populated or changed |
| `conflict_detected` | llm | Conflict check found a conflict between fields |
| `conflict_resolved` | human | User resolved a detected conflict |
| `phase1_locked` | human | Phase 1 signed off — ready for Phase 2 |

*Per layer*
| Event | Actor | Description |
|-------|-------|-------------|
| `layer_started` | llm | Decomposition of a new layer began |
| `layer_defined` | llm | Layer definition created (name, scope, considerations, checklist template) |
| `layer_definition_approved` | human | User approved layer definition |
| `layer_definition_edited` | human | User edited layer definition |
| `layer_definition_updated` | llm | LLM updated layer definition mid-loop — triggers re-approval |
| `layer_locked` | llm | All nodes in layer passed — layer is done |
| `phase2_locked` | human | All layers locked, Phase 2 signed off |

*Per node*
| Event | Actor | Description |
|-------|-------|-------------|
| `node_proposed` | llm | Node created during decomposition |
| `node_claimed` | llm | Existing node claimed as shared child by a new parent |
| `node_claim_rejected` | llm | Shared node claim rejected — edits would break original parent |
| `node_checklist_generated` | llm | Checklist created for node from layer template |
| `node_checklist_approved` | human | User approved node checklist |
| `node_checklist_edited` | human | User edited node checklist |
| `node_checklist_updated` | llm | Checklist updated after layer definition change — triggers re-approval |
| `node_validation_attempted` | llm | Validation call made against checklist |
| `node_validation_passed` | llm | Node passed all checklist items |
| `node_validation_failed` | llm | Node failed one or more checklist items |
| `node_locked` | llm | Node state set to locked |
| `node_leaf_determined` | llm | LLM classified node as leaf or decompose-further with reasoning |
| `node_leaf_confirmed` | human | Human confirmed or overrode leaf determination |
| `node_rewritten` | llm | Node intent/inputs/outputs rewritten by Prompt 8 to fix failed checklist items — payload includes old and new values |
| `node_invalidated` | llm \| human | Node state set to invalidated — payload includes reason |

*Edges*
| Event | Actor | Description |
|-------|-------|-------------|
| `edge_proposed` | llm | Edge created during decomposition |
| `edge_invalidated` | llm \| human | Edge removed or invalidated |

*Collective vertical + syntax*
| Event | Actor | Description |
|-------|-------|-------------|
| `collective_vertical_attempted` | llm | Collective vertical check ran |
| `collective_vertical_passed` | llm | Siblings fully cover all parents, no overlaps |
| `collective_vertical_failed` | llm | Gaps or overlaps found — payload includes details |
| `syntax_check_attempted` | llm | Syntax checker ran |
| `syntax_check_passed` | llm | All structural rules passed |
| `syntax_check_failed` | llm | One or more structural rules failed — payload includes details |

*Failure handling*
| Event | Actor | Description |
|-------|-------|-------------|
| `failure_diagnosed` | llm | LLM classified failure as impl or design, identified origin nodes |
| `diagnosis_confirmed` | human | Human confirmed LLM diagnosis |
| `diagnosis_overridden` | human | Human overrode LLM diagnosis |
| `upward_traversal_triggered` | human | Traversal started — payload includes origin nodes |
| `upward_traversal_completed` | llm | Traversal done — payload includes all invalidated nodes |

*Human override*
| Event | Actor | Description |
|-------|-------|-------------|
| `human_override` | human | Human edited architecture directly via C4 view — payload includes what changed |

*Phase transition*
| Event | Actor | Description |
|-------|-------|-------------|
| `phase_transitioned` | human | Moved between phases — payload includes from/to |

---

## 9. API Design

The REST API is a first-class interface — not just a backend for the UI. It must be independently usable for automated testing, debugging individual steps, and future integrations.

Practical request/response examples are documented in `docs/api.md`.

### 9.1 Design principles

- **Every step individually callable** — each LLM call, validation step, and state transition has its own endpoint. Nothing is bundled together in a way that forces you to run the full flow to reach a specific step.
- **Raw LLM output always accessible** — every endpoint that calls the LLM returns both the processed result and the raw LLM response. This makes prompt debugging possible without log-diving.
- **State fully inspectable** — dedicated read endpoints for every piece of system state: current spec, current stack, nodes at any depth, event history for any node, full timeline.
- **No UI dependency** — the API works correctly without a browser. All human gates are implemented as explicit POST endpoints, not implicit UI state.

### 9.2 Phase 1 endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/phase1/spec` | Current ProblemSpec state |
| `POST` | `/api/phase1/message` | Send user message, run Prompt 1, return LLM reply + spec update |
| `POST` | `/api/phase1/conflict-check` | Run Prompt 2, return conflict results + raw LLM output |
| `POST` | `/api/phase1/lock` | Lock Phase 1, emit events |

### 9.3 Phase 2 — Layer endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/phase2/stack` | Current stack (all layers defined so far) |
| `GET` | `/api/phase2/layer/:depth/definition` | Layer definition for given depth |
| `POST` | `/api/phase2/layer/:depth/definition/generate` | Run Prompt 3, return layer definition + raw LLM output |
| `POST` | `/api/phase2/layer/:depth/definition/approve` | Approve or edit+approve layer definition |
| `GET` | `/api/phase2/layer/:depth/nodes` | All nodes at given depth |
| `POST` | `/api/phase2/layer/:depth/nodes/propose` | Run Prompt 4, return proposed nodes + checklists + raw LLM output |
| `POST` | `/api/phase2/layer/:depth/nodes/approve` | User confirms proposed nodes and checklists |

### 9.4 Phase 2 — Validation endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/phase2/layer/:depth/validate/node/:nodeId` | Run Prompt 5 on a single node, return checklist results + raw LLM output |
| `POST` | `/api/phase2/layer/:depth/validate/collective` | Run Prompt 6 collective vertical check, return coverage + overlap results + raw LLM output |
| `POST` | `/api/phase2/layer/:depth/validate/syntax` | Run syntax checker (rule-based), return structural errors |
| `POST` | `/api/phase2/layer/:depth/lock` | Lock layer after all validation passes |

### 9.5 Phase 2 — Failure handling endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/phase2/diagnose/:nodeId` | Run Prompt 7 failure diagnosis, return classification + origin nodes + raw LLM output |
| `POST` | `/api/phase2/diagnose/:nodeId/confirm` | Human confirms or overrides diagnosis |
| `POST` | `/api/phase2/diagnose/:nodeId/rewrite` | Run Prompt 8 — rewrite node intent/inputs/outputs based on failed checklist items, auto-revalidates |
| `POST` | `/api/phase2/traverse/upward` | Trigger upward traversal from given origin nodes, invalidate affected nodes |

### 9.6 State inspection endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/state/session` | Current session state (phase, depth) |
| `GET` | `/api/state/timeline` | Full event timeline ordered by timestamp |
| `GET` | `/api/state/node/:nodeId/history` | Full event history for a specific node |
| `GET` | `/api/state/nodes/pending` | All nodes currently in `pending` state |
| `GET` | `/api/state/nodes/invalidated` | All nodes currently in `invalidated` state |
| `GET` | `/api/state/layer/:depth/status` | Lock state + node states for a given depth |

### 9.7 Dev utilities

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/dev/reset` | Wipe all application data (dev only — disabled in production) |
| `POST` | `/api/dev/seed` | Seed Phase 1 URL shortener spec and transition to Phase 2 (dev only) |

### 9.8 Response envelope

All endpoints return a consistent response shape:

```json
{
  "ok": true,
  "data": {},
  "llm_raw": null
}
```

- `ok` — boolean, false on error
- `data` — the processed result for this endpoint
- `llm_raw` — the raw LLM response string if this endpoint called the LLM, otherwise null
- On error:

```json
{ "ok": false, "error": { "code": "string", "message": "string" } }
```

---

## 10. V1 Scope

- ✅ Phase 1 (Problem Space Definition) — full implementation
- ✅ Phase 2 (Architecture) — full implementation including iteration loop, validation, upward traversal
- ✅ Persistent architecture DAG with full event sourcing
- ✅ Web UI with C4 export
- ✅ REST API as first-class interface (spec Section 9)
- ❌ Phase 3 (Implementation) — deferred, will be an agent handoff when built
- ❌ Hypertree / parallel branch exploration — deferred to V2
- ❌ Centralized type registry — deferred. V1 enforces type agreement at edges; a canonical type registry across the full DAG is a V2 concern
- ✅ Demo problem: URL shortener (seed script in dev utilities)

---

## 11. Open Questions

These are the only remaining unresolved items as of last update:

| # | Question | Where it surfaces |
|---|----------|-------------------|
| 11.1 | Additional syntax checker structural rules beyond the 6 defined | Section 6, step 4 |
| 11.2 | Exact prompt text for all 7 prompts — structure defined, wording to be written and refined during implementation | Section 7.3 |
| 11.3 | Prompt versioning — do we track prompts as part of the system? | Section 7 |
| 11.5 | Graph library choice (graphology vs custom) | Section 8 |
| 11.6 | LLM SDK (direct Azure REST vs OpenAI-compatible) | Section 8 |

Items 11.1–11.3 are best resolved during implementation once the full system is visible. Items 11.5–11.6 are minor and can be decided at first implementation session.

---

## 12. Decision Log

| Date | Decision |
|------|----------|
| 2026-04-09 | Hypertree / parallel branches cut from V1 |
| 2026-04-09 | Three phases: Problem Space → Architecture → Implementation (deferred) |
| 2026-04-09 | Phase 1 produces a structured spec document, not a graph |
| 2026-04-09 | A node is a subsystem — analogous to a C4 component |
| 2026-04-09 | An edge is an interface contract, not just a dependency link |
| 2026-04-09 | Nodes have no output — the locked architecture is the artifact |
| 2026-04-09 | Context resolved at call time, not stored in nodes |
| 2026-04-09 | Nodes can have multiple parents — vertical structure is a DAG, not a strict tree |
| 2026-04-09 | Neighbours = any node connected via edge at same depth — cross-parent edges valid, cross-layer edges forbidden |
| 2026-04-09 | Full loop runs every layer — no shortcuts |
| 2026-04-09 | Two criteria artifacts: layer definition (per layer) + node checklist (per node) |
| 2026-04-09 | Collective vertical check fires only when layer is thought complete |
| 2026-04-09 | Syntax checker is rule-based, no LLM, deterministic |
| 2026-04-09 | Cycles and bidirectional edges valid within horizontal levels; cycles forbidden in vertical decomposition |
| 2026-04-09 | Failure diagnosis: impl vs design, LLM proposes, human confirms |
| 2026-04-09 | Design errors can have multiple origin nodes — each traces through a different parent chain |
| 2026-04-09 | Upward traversal can go all the way to Phase 1 spec — LLM picks origin(s) |
| 2026-04-09 | Phase 2 can reopen Phase 1 — surgical propagation, untouched branches stay locked |
| 2026-04-09 | Phase transitions gated by structured criteria, not open-ended LLM judgment |
| 2026-04-09 | Phase 1 conflicts = hard stop — user must resolve before proceeding |
| 2026-04-09 | Human approval default = high oversight for V1, dial back as product matures |
| 2026-04-09 | Storage = Neo4j + full event sourcing |
| 2026-04-09 | LLM = Kimi K2.5 via Azure, single model for V1 |
| 2026-04-09 | Language = TypeScript / JS |
| 2026-04-09 | Interface = simple web UI, C4 view editable as escape hatch only |
| 2026-04-09 | Full Phase 1 spec included on every LLM call |
| 2026-04-09 | All node validation results include full reasoning — passes and failures |
| 2026-04-09 | All nodes for a layer proposed in a single call |
| 2026-04-09 | Phase 1 elicitation: collaborative role, spec doc updates in real time |
| 2026-04-09 | Node ID = depth + human-readable slug (e.g. L2-auth-service) |
| 2026-04-09 | Phase 1 required fields expanded to 8 — added assumptions, NFRs, existing context |
| 2026-04-09 | No explicit conflict priority ranking — covered by constraints + NFRs |
| 2026-04-12 | Prompt 1 context includes latest unresolved conflicts from the most recent Prompt 2 run |
| 2026-04-22 | Abstraction stack changed from predefined plan to growing log — layers defined one at a time |
| 2026-04-22 | Remap mechanism removed — no predeclared stack means nothing to remap |
| 2026-04-22 | Prompts reduced from 9 to 7 — old Prompts 3 (full stack proposal) and 4 (stack evolution check) eliminated |
| 2026-04-22 | Layer definition (new Prompt 3) absorbs responsibility of naming and defining each layer |
| 2026-04-22 | Leaf termination = node contains no sub-components, only logic — describes a single function |
| 2026-04-22 | Node schema gains inputs/outputs attributes — vague at upper layers, typed signatures at leaf |
| 2026-04-22 | Edge schema gains progressive type maturity — natural language at top, typed API contracts at leaf |
| 2026-04-22 | New leaf-level validation: source outputs ↔ edge interface ↔ target inputs must agree |
| 2026-04-22 | Shared node creation: decomposer can claim existing nodes, edits validated against original parents |
| 2026-04-22 | Failed shared node claims produce near-duplicates caught by collective vertical check |
| 2026-04-22 | Q10.7 (shared node creation) resolved |
| 2026-04-22 | Centralized type registry deferred to V2 — V1 enforces type agreement at edges only |
| 2026-04-22 | Section 1 reframed: software architecture instantiation of a domain-agnostic loop |
| 2026-04-22 | "Node has no output" reworded to "node does not produce implementation artifacts" |
| 2026-04-22 | Node relocation deferred to future version of structural checker |
| 2026-04-22 | Prompt 4 decomposition is per-parent, not per-layer — each parent decomposes separately |
| 2026-04-22 | Leaf determination: LLM proposes leaf/decompose-further after layer locks, human confirms |
| 2026-04-22 | Phase 2 exit condition: all nodes are either locked leaves or have locked children |
| 2026-04-22 | Syntax checker rule "every non-leaf node has at least one edge" dropped — collective vertical catches meaningful version |
| 2026-04-22 | Syntax checker down to 6 rules from 7 |
| 2026-04-22 | Context assembly in Section 4.5 updated to canonical list with per-prompt subsetting in Section 7 |
| 2026-04-23 | Prompt 8 (Node Rewrite) added — implementation error repair path: rewrites node intent/inputs/outputs in place based on failed checklist items, auto-revalidates |
| 2026-04-23 | `node_rewritten` event added to catalogue |
| 2026-04-23 | Phase 2 loop updated: implementation error path now uses rewrite (Prompt 8) instead of bare retry |
| 2026-04-23 | Leaf-confirmed nodes excluded from parent candidates when proposing next layer — prevents decomposing nodes already marked as leaves |