# Intent Tree — Technical Specification
> V1 build target. Last updated: 2026-04-09.

---

## 1. Origin & Motivation

LLMs are powerful but undisciplined. They reason well locally but lose coherence over long problem-solving sessions — they drift, contradict themselves, and produce solutions that feel right at every step but don't hold together as a whole.

The Intent Tree framework was designed by working backwards from how a senior engineer actually solves hard problems: they don't just generate — they decompose. They break a problem into well-defined sub-problems, validate that the pieces fit together, and only drill into specifics once the structure is sound. If something breaks at a lower level, they don't patch it locally — they trace it back to its root cause.

The framework emulates this process. It is general-purpose — applicable to any problem requiring structured decomposition, not just software architecture. But the output looks like a C4 diagram: a hierarchy of subsystems with explicit interface contracts between them, decomposed until each node is atomic enough that implementation is obvious.

---

## 2. Core Concept

The system operates on a **DAG of subsystem nodes** (directed acyclic graph — nodes can have multiple parents). Each node represents a unit of solution responsibility. Nodes decompose into child nodes (vertical), and nodes at the same level connect via interface contracts (horizontal edges).

The architecture is not built in one shot. It is constructed layer by layer, with each layer validated before the next is started. Validation has two dimensions:

- **Horizontal** — do the nodes at this layer cohere with each other? Are their interface contracts well-defined?
- **Vertical** — do the nodes at this layer correctly and completely decompose their parent(s)?

The end state is a fully locked architecture where every node is well-defined, every edge is a clear contract, and every layer provably serves the one above it. This locked architecture is the artifact — it gets handed to an implementation agent (e.g. Claude Code, Copilot) for execution.

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
- A node has no output. The locked architecture is the artifact.
- A leaf node is one at the bottom layer of the abstraction stack — no further decomposition is defined below it.
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

**Context is not stored in nodes.** Inherited context (Phase 1 spec + all parents + siblings + edge-connected neighbours) is assembled at call time — not copied into each node. This keeps storage lean and makes re-validation cheap after upward traversal.

**Node creation:** How shared nodes are proposed, recognized, and assigned multiple parents is an open design problem — not yet defined. See Section 10.

### 4.3 Edge

An edge is an **interface contract between sibling subsystems** — not just a dependency link. It describes what is exchanged and how.

- Edges are horizontal — they connect nodes at the same layer depth, regardless of whether those nodes share a parent.
- Edges can be directed or bidirectional. Cycles within a horizontal layer are valid — circular dependencies accurately model real architectures (e.g. auth service ↔ user service).
- **No edges between layers.** Cross-layer relationships are handled two ways:
  - **Inheritance** — a child carries its parent's intent downward through decomposition
  - **Node relocation** — if a node clearly belongs at the current layer rather than where it sits, it gets moved. If it's already atomic, it stays.
- Cycles in the **vertical** direction are forbidden — a node cannot be its own ancestor.

**Edge schema:**

| Field | Description |
|-------|-------------|
| `id` | Unique identifier |
| `source` | Source node ID |
| `target` | Target node ID |
| `interface` | What is exchanged and how (e.g. REST API, event queue, shared DB) |
| `direction` | `directed` or `bidirectional` |

### 4.4 DAG Level

A level is the set of all nodes at a given depth across the entire architecture. Levels do not have their own lock state — a level is considered locked when all its nodes are locked.

### 4.5 Architecture Graph

- Root node = top-level architecture problem (depth 0)
- Root inherited context = Phase 1 spec (not a parent node — there is none at depth 0)
- **Context assembly per LLM call:** Phase 1 spec + all parent nodes + siblings at same depth + edge-connected neighbours at same depth. Resolved at call time, never stored.
- **Neighbours = any node connected via an edge at the same layer depth** — not limited to siblings (same parent). Cross-parent edges are valid as long as both nodes are at the same depth.
- **Multiple parents:** The vertical structure is a DAG, not a strict tree. A node can be a child of more than one parent and must satisfy all of them simultaneously.

---

## 5. Abstraction Stack

Before any decomposition begins in Phase 2, the LLM proposes an **abstraction stack** — the ordered list of conceptual layers the architecture will pass through from root to leaf.

Example for a web application: `System → Service → Module → Function`

This is problem-specific. A business strategy problem has a different stack than a software architecture problem.

**Rules:**
- LLM proposes the stack based on Phase 1 spec. User approves or edits before Phase 2 proceeds.
- Every node's context includes its current position in the stack — the LLM always knows what layer it's at and what's above and below.
- **Leaf termination:** a node is a leaf when it sits at the bottom layer of the stack. No further decomposition is defined below it. This is deterministic — no judgment call required.

**Stack evolution:** The stack is not frozen after Phase 2 starts. It can be revised at:
- The start of each new layer (safest — no retroactive invalidation)
- During upward traversal (natural moment since work is already being invalidated)
- User-initiated at any point

When the stack changes mid-way, existing nodes are **remapped** to their new layer positions where possible. Intermediate layers are decomposed fresh. Remapped nodes are flagged as `invalidated` — they are a starting point, not a source of truth. The same invalidation mechanism used for upward traversal handles stack changes.

Stack evolution requires frictionless user confirmation — the system shows the proposed change, user accepts in one action. Not a hard approval gate, but the user always sees it.

---

## 6. Phase 2 — Layer Iteration Loop

This is the core of the framework. Each layer goes through a full loop before locking. Every layer runs the full loop — no shortcuts for shallow layers.

```
START OF LAYER
│
├─ 1. Stack evolution check
│       LLM checks if abstraction stack still holds given what's been learned.
│       User sees proposed changes — frictionless confirm or edit.
│
├─ 2. Generate layer criteria doc
│       LLM generates a layer-specific criteria document from:
│         - All parent node(s) intent at this depth
│         - Parent layer criteria doc (from the layer above)
│         - Current abstraction stack position
│         - Phase 1 spec
│       This is a LAYER SPECIFICATION, not just a checklist. It defines:
│         - Layer name (e.g. "Service Layer")
│         - Responsibility scope — what problems get solved at this level
│         - Considerations — what the LLM should think about when decomposing here
│         - Out of scope — what belongs above or below this layer
│       User approves or edits before loop proceeds.  ← HUMAN GATE
│
├─ 3. LLM proposes nodes for this layer
│       Generates sibling nodes + a node checklist for each node.
│       Node checklists are generated from the layer criteria doc as a template.
│       User reviews node checklists.  ← HUMAN GATE
│
├─ 4. NODE ITERATION LOOP
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
│   ├─ IF PASS (all nodes pass individual checklists):
│   │     → Trigger collective vertical check
│   │     → IF PASS: proceed to syntax checker
│   │     → IF FAIL: specific gaps/overlaps returned → retry from node iteration
│   │
│   └─ IF FAIL (any node fails checklist):
│         LLM diagnoses failure type with reasoning:
│           - Implementation error → retry this node
│           - Design error → surface diagnosis + reasoning to user
│         User confirms or overrides diagnosis.  ← HUMAN GATE
│           - Confirmed implementation → retry
│           - Confirmed design → UPWARD TRAVERSAL
│               LLM identifies the origin nodes (can be anywhere from direct parents
│               to Phase 1 spec — multiple origins possible). All nodes from each
│               origin downward are invalidated. Stack evolution check may trigger here too.
│
├─ 5. Syntax checker (rule-based, no LLM, fully deterministic)
│       Checks structural correctness — things the iteration loop can't self-report:
│         □ No cycles in vertical decomposition (node cannot be its own ancestor)
│         □ Cycles and bidirectional edges valid within horizontal level
│         □ No edges between nodes at different depths — cross-layer relationships must use inheritance or node relocation
│         □ No orphaned nodes
│         □ All edges reference valid source and target node IDs
│         □ No two sibling nodes have identical intents
│         □ Every non-leaf node has at least one edge
│       IF FAIL → specific structural error returned → re-enter node iteration
│
└─ 6. Layer locks
        State of all nodes in layer set to `locked`.
        Descend to next layer or, if all layers complete, exit loop.

END OF LAYER → repeat from START OF LAYER for next depth level
```

**Criteria evolution mid-loop:** If the layer criteria doc needs updating during iteration, the updated version requires user re-approval before taking effect. The LLM cannot silently move goalposts.

---

## 7. LLM Context Design

### 7.1 What every call receives
- Full Phase 1 spec — always, on every call, no exceptions

### 7.2 Context payload by call type

Each call type receives a different payload — purpose-built, not a generic dump.

**Decomposition call** (generate child nodes for a parent)
- Format: natural language — this is a creative reasoning task
- Contents: Phase 1 spec, all parent node(s) intent, abstraction stack with current position marked, layer criteria doc

**Validation call** (check node against checklist)
- Format: structured — this is a comparison task, needs to be unambiguous
- Contents: Phase 1 spec, node being validated, checklist as structured pass/fail items, siblings + edge-connected neighbours as JSON

**Diagnosis call** (classify a failure as implementation or design error)
- Format: narrative — this is a causal reasoning task
- Contents: Phase 1 spec, failed node, which checklist items failed + why, all parent nodes, siblings + edge-connected neighbours in NL

### 7.3 Prompt Catalogue

Nine distinct prompts. Each defined by what it receives, what it returns, and format.

---

**Prompt 1 — Problem space elicitation** (Phase 1, conversational)

Role: collaborative — LLM leads with structure but adapts to how the user communicates. Not a rigid interview.

Receives (per turn):
- The 8 required field schemas
- Current spec doc state (what's filled, what isn't)
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

**Prompt 3 — Abstraction stack proposal** (Phase 2 start)

Receives:
- Full Phase 1 spec

Returns:
```json
{
  "stack": [
    {
      "layer": "System",
      "description": "what kind of decisions happen at this level",
      "reasoning": "why this layer exists given the problem"
    }
  ]
}
```

User sees stack + reasoning, edits if needed, confirms before Phase 2 proceeds.

---

**Prompt 4 — Stack evolution check** (start of each layer)

Fires silently at the start of every layer. Only surfaces to user if a change is needed.

Receives:
- Full Phase 1 spec
- Current abstraction stack + current position
- Summary of locked layers and their nodes so far

Returns:
```json
{
  "change_needed": false,
  "proposed_stack": [...],
  "reasoning": "what was learned that suggests this change"
}
```

If `change_needed: false` — proceed silently. If `change_needed: true` — surface to user with reasoning, frictionless confirm or edit.

---

**Prompt 5 — Layer criteria doc generation** (start of each layer, after stack check)

Receives:
- Full Phase 1 spec
- Current abstraction stack + current position
- Parent node(s) intent — all parents if multiple
- Parent layer criteria doc (from the layer above)
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

**Prompt 6 — Node + checklist proposal** (decomposition call)

All nodes for a layer proposed in a single call. Format: natural language heavy — this is a creative reasoning task.

Receives:
- Full Phase 1 spec
- Current stack + position
- Parent node(s) intent
- Layer criteria doc
- Any nodes already existing at this depth

Returns:
```json
{
  "nodes": [
    {
      "id": "L2-auth-service",
      "intent": "what this subsystem is responsible for",
      "parents": ["L1-backend"],
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

User reviews node checklists before validation begins.

---

**Prompt 7 — Node validation** (validation call, per node)

Format: structured — comparison task.

Receives:
- Full Phase 1 spec
- Node being validated (id, intent, edges)
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

---

**Prompt 8 — Collective vertical check** (after all nodes pass individually)

Receives:
- Full Phase 1 spec
- All parent nodes at this layer
- Full set of sibling nodes + their intents
- Layer criteria doc

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

---

**Prompt 9 — Failure diagnosis** (diagnosis call)

Fires on any failed node validation. Format: narrative — causal reasoning task.

Receives:
- Full Phase 1 spec
- Failed node + checklist results (which items failed + reasoning)
- All parent nodes
- Siblings + edge-connected neighbours
- Layer criteria doc
- Current abstraction stack + position

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
- Full history of a node: `MATCH (e:Event)-[:AFFECTS]->(n:Node {id: 'L2-auth-service'}) RETURN e ORDER BY e.timestamp`
- Full system timeline: `MATCH (e:Event) RETURN e ORDER BY e.timestamp`
- All validation failures: `MATCH (e:Event {type: 'node_validation_failed'}) RETURN e`

**Event type catalogue (~38 types):**

*Phase 1*
| Event | Actor | Description |
|-------|-------|-------------|
| `spec_field_updated` | llm \| human | A Phase 1 spec field was populated or changed |
| `conflict_detected` | llm | Conflict check found a conflict between fields |
| `conflict_resolved` | human | User resolved a detected conflict |
| `phase1_locked` | human | Phase 1 signed off — ready for Phase 2 |

*Phase 2 setup*
| Event | Actor | Description |
|-------|-------|-------------|
| `stack_proposed` | llm | LLM proposed the abstraction stack |
| `stack_approved` | human | User approved the stack |
| `stack_edited` | human | User made changes to the proposed stack |
| `stack_evolved` | llm \| human | Stack changed mid-Phase 2 — nodes remapped |
| `stack_check_passed` | llm | Stack evolution check ran, no changes needed |

*Per layer*
| Event | Actor | Description |
|-------|-------|-------------|
| `layer_started` | llm | Decomposition of a new layer began |
| `criteria_doc_generated` | llm | Layer criteria doc created |
| `criteria_doc_approved` | human | User approved criteria doc |
| `criteria_doc_edited` | human | User edited criteria doc |
| `criteria_doc_updated` | llm | LLM updated criteria mid-loop — triggers re-approval |
| `layer_locked` | llm | All nodes in layer passed — layer is done |
| `phase2_locked` | human | All layers locked, Phase 2 signed off |

*Per node*
| Event | Actor | Description |
|-------|-------|-------------|
| `node_proposed` | llm | Node created during decomposition |
| `node_checklist_generated` | llm | Checklist created for node from layer template |
| `node_checklist_approved` | human | User approved node checklist |
| `node_checklist_edited` | human | User edited node checklist |
| `node_checklist_updated` | llm | Checklist updated after criteria doc change — triggers re-approval |
| `node_validation_attempted` | llm | Validation call made against checklist |
| `node_validation_passed` | llm | Node passed all checklist items |
| `node_validation_failed` | llm | Node failed one or more checklist items |
| `node_locked` | llm | Node state set to locked |
| `node_invalidated` | llm \| human | Node state set to invalidated — payload includes reason |
| `node_remapped` | llm | Node moved to new layer position after stack change |

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

## 9. V1 Scope

- ✅ Phase 1 (Problem Space Definition) — full implementation
- ✅ Phase 2 (Architecture) — full implementation including iteration loop, validation, upward traversal
- ✅ Persistent architecture DAG with full event sourcing
- ✅ Web UI with C4 export
- ❌ Phase 3 (Implementation) — deferred, will be an agent handoff when built
- ❌ Hypertree / parallel branch exploration — deferred to V2
- ❓ End-to-end V1 demo problem — to be defined

---

## 10. Open Questions

These are the only remaining unresolved items as of last update:

| # | Question | Where it surfaces |
|---|----------|-------------------|
| 10.1 | Additional syntax checker structural rules beyond the 6 defined | Section 6, step 5 |
| 10.2 | Exact prompt text for all 9 prompts — structure defined, wording to be written and refined during implementation | Section 7.3 |
| 10.3 | Prompt versioning — do we track prompts as part of the system? | Section 7 |
| 10.4 | End-to-end V1 demo problem | Section 9 |
| 10.5 | Graph library choice (graphology vs custom) | Section 8 |
| 10.6 | LLM SDK (direct Azure REST vs OpenAI-compatible) | Section 8 |
| 10.7 | Node creation — how are shared nodes (multiple parents) proposed, recognized, and claimed during decomposition? | Section 4.2 |

Items 10.1–10.3 are best resolved during implementation once the full system is visible. Items 10.5–10.6 are minor and can be decided at first implementation session.

---

## 11. Decision Log

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
| 2026-04-09 | Abstraction stack defined at start of Phase 2 — problem-specific |
| 2026-04-09 | Leaf termination = bottom of the abstraction stack |
| 2026-04-09 | Stack can evolve at layer boundaries, during traversal, or user-initiated |
| 2026-04-09 | Stack change = remap existing nodes, don't discard |
| 2026-04-09 | Full loop runs every layer — no shortcuts |
| 2026-04-09 | Two criteria artifacts: layer criteria doc (per layer) + node checklist (per node) |
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
| 2026-04-09 | 9 distinct prompt types defined — one per system function |
| 2026-04-09 | Full Phase 1 spec included on every LLM call |
| 2026-04-09 | All node validation results include full reasoning — passes and failures |
| 2026-04-09 | All nodes for a layer proposed in a single call |
| 2026-04-09 | Stack evolution check fires silently — only surfaces to user if change needed |
| 2026-04-09 | Phase 1 elicitation: collaborative role, spec doc updates in real time |
| 2026-04-09 | Node ID = depth + human-readable slug (e.g. L2-auth-service) |
| 2026-04-09 | Phase 1 required fields expanded to 8 — added assumptions, NFRs, existing context |
| 2026-04-09 | No explicit conflict priority ranking — covered by constraints + NFRs |