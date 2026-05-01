# Intent Tree — Frontend Specification
> V1 build target. Last updated: 2026-05-01. Backend is source of truth.

---

## 1. Purpose & Scope

This document specifies the frontend for the Intent Tree web application. It covers screen layout, component design, interaction model, and data-fetching strategy. Backend API contracts are in `docs/api.md`. System behaviour is in `docs/intent-tree.md`.

The frontend's primary job is surfacing the current system state and presenting human gates clearly. Every approve / edit / confirm touchpoint must be unambiguous. The UI does not drive the loop — the backend does. The UI is a viewport into it.

---

## 2. Tech Stack

| Concern | Decision | Rationale |
|---------|----------|-----------|
| Bundler | Vite | Fast DX, native ESM |
| UI framework | React 18 | Required by ReactFlow |
| DAG rendering | ReactFlow | Pan/zoom, custom nodes/edges, EdgeLabelRenderer |
| DAG layout | Dagre (`@dagrejs/dagre`) | Left-to-right layered layout, fits depth-column structure |
| Data fetching | TanStack Query | Maps cleanly to REST API; handles polling, caching, invalidation |
| Routing | React Router v6 | Two routes only |
| Styling | CSS custom properties | Design tokens from synthesis.html; no CSS framework |
| Fonts | Inter Tight + JetBrains Mono | Via Google Fonts |

No global state manager. TanStack Query owns all server state. React `useState` / `useReducer` owns local UI state (selected node, active tab, sidebar mode).

---

## 3. Routes

Two routes. Layouts are different enough to warrant separate pages. The app checks session phase on load and redirects accordingly — if Phase 1 is already locked, `/` redirects to `/phase2`.

| Route | Screen | Entry condition |
|-------|--------|-----------------|
| `/` | Phase 1 | Default; redirects to `/phase2` if session is in phase 2 |
| `/phase2` | Phase 2 | Redirects to `/` if Phase 1 not yet locked |

---

## 4. Design System

Canonical design language established in `public/synthesis.html`.

### 4.1 Color tokens

```css
--bg:      #0f1117      /* page background */
--s1:      #161b27      /* surface 1 — panels, sidebars */
--s2:      #1c2235      /* surface 2 — inputs, cards, node fills */
--bdr:     #2a3147      /* default border */
--bdr-hi:  #3d4f70      /* highlighted / hover border */
--tx1:     #c8d0e0      /* primary text */
--tx2:     #8a94ad      /* secondary text */
--tx3:     #4e5a75      /* muted text, labels, IDs */
--acc:     #2dd4bf      /* teal — brand, selection, primary action */
--acc-d:   rgba(45,212,191,.10)

/* Node / edge display states (derived — see Section 4.5) */
--pending:      #4e5a75    --bg-pending:   transparent
--locked:       #4e5a75    --bg-locked:    rgba(78,90,117,.08)
--proposed:     #f59e0b    --bg-proposed:  rgba(245,158,11,.08)
--passed:       #34d399    --bg-passed:    rgba(52,211,153,.07)
--failed:       #f87171    --bg-failed:    rgba(248,113,113,.08)
--invalidated:  #4e5a75    --bg-invalidated: transparent
```

`invalidated` nodes use `--tx3` text with a strikethrough on the ID. No distinct background fill.

### 4.2 Typography

| Role | Font | Size | Weight | Treatment |
|------|------|------|--------|-----------|
| Body, labels | Inter Tight | 13px | 400–500 | — |
| Section headers | Inter Tight | 10px | 600 | uppercase, letter-spacing |
| IDs, badges, data | JetBrains Mono | 9–11px | 400–500 | — |
| Edge labels | JetBrains Mono | 10px | 400 | — |

### 4.3 Geometry

- Global header: 42px
- Left sidebar: 220px
- Right panel: 300px
- Node card: 200px wide, min 80px tall, auto height
- Panel borders: 1px `--bdr`
- Border radius: 3–4px throughout

### 4.4 Interactive states

- **Hover:** border shifts to `--bdr-hi`
- **Selected:** border shifts to `--acc`, 2px
- **Disabled:** opacity 0.4, cursor not-allowed
- **LLM in flight:** primary button shows spinner, disabled; header shows pulsing dot
- **Initial load:** Phase 2 first paint hits several parallel fetches (`useSession`, `useStack`, `useLayerNodes`, `useTimeline`). While resolving: header shows brand + `phase 2 · · ·`, sidebar shows a pulsing `--bdr` placeholder block, DAG canvas shows the dot grid background with no nodes, right panel Step tab shows "Loading layer state..." spinner. Phase 1 is simpler — only `useSpec` must resolve before rendering.

### 4.5 Display state derivation

The backend stores 4 node states: `pending`, `in_progress`, `locked`, `invalidated`. In practice, only 3 are used — the backend never sets `in_progress`. Nodes go `pending` → `locked` → `invalidated`. The frontend derives 6 **display states** for visual rendering by combining the backend state with event history from `GET /api/state/node/:nodeId/history`.

| Display state | Condition | Description |
|---------------|-----------|-------------|
| `pending` | Backend state is `pending` AND no `node_proposed` event exists for this node | Node exists but has not been proposed yet (rare — only during proposal processing) |
| `proposed` | Backend state is `pending` AND `node_proposed` event exists AND no `node_validation_passed` or `node_validation_failed` event exists | Node has been proposed and approved but not yet validated |
| `passed` | Backend state is `pending` AND the most recent validation event (`node_validation_passed` or `node_validation_failed`) is `node_validation_passed` | Node passed its checklist validation |
| `failed` | Backend state is `pending` AND the most recent validation event is `node_validation_failed` | Node failed one or more checklist items |
| `locked` | Backend state is `locked` | Node is locked — validation and layer lock both complete |
| `invalidated` | Backend state is `invalidated` | Node has been invalidated by upward traversal |

Implementation: a `deriveDisplayState(node, events)` utility function takes the backend `ArchNode` and its event history, returns one of the 6 display states. All rendering code uses the display state, never the raw backend state directly.

Event history is fetched lazily — only for visible nodes. The `useNodeHistory(nodeId)` hook wraps `GET /api/state/node/:nodeId/history` and is enabled only when the node is in `pending` state (the only state where derivation depends on events). For `locked` and `invalidated`, the display state matches the backend state directly — no event lookup needed.

### 4.6 Step derivation

The backend session has `current_phase` and `current_depth` but no explicit step field. The frontend derives the current step from layer state and event history. This powers the header label and Step tab content.

Derivation logic (checked in order for the current `current_depth`):

1. **No layer definition exists** at current depth → step: `layer definition`
2. **Layer definition exists but is not locked** (pending approval) → step: `layer definition`
3. **Layer definition locked, no nodes at this depth** → step: `node proposals`
4. **Nodes exist, not all have a validation event** → step: `validation`
5. **Any node's most recent validation event is `node_validation_failed`** → step: `validation` (with failures)
6. **All nodes passed individually, no `edge_validation_passed` event for this depth** → step: `edge validation`
7. **Edge validation passed, no `collective_vertical_passed` event for this depth** → step: `collective check`
8. **Collective passed, no `syntax_check_passed` event for this depth** → step: `syntax check`
9. **Syntax passed, layer not yet locked** → step: `idle` — frontend auto-triggers `POST /api/phase2/layer/:depth/lock` (layer lock is not a human gate — see `intent-tree.md` Section 6). Show progress indicator while locking. **Guard:** the auto-lock mutation must be protected by a `useRef` flag to prevent double-fire on re-render — the derivation condition stays true between when the mutation fires and when the lock event lands in the timeline. Pattern: `const lockFired = useRef(false)`, set `true` before calling the mutation, reset when `session.id + session.current_depth` changes (not depth alone — a new session can reset depth to 0).
10. **Layer locked, no `node_leaf_confirmed` events for nodes at this depth** → step: `leaf determination`
11. **Leaf determination confirmed** → step: `locked` (show summary + next layer button)
12. **All layers complete, no non-leaf nodes without children** → step: `phase2 complete`

Note: The backend requires nodes to be in `locked` state before `POST .../leaf/determine` can run. The frontend must wait for the lock call to complete before showing the leaf determination UI.

**Loading state:** The `useCurrentStep(depth)` hook depends on `useLayerDefinition`, `useLayerNodes`, `useLayerStatus`, and `useTimeline`. While any of these are in a loading/fetching state, the step cannot be derived. The hook returns a `deriving` status in this case — the Step tab shows a spinner with "Loading layer state..." and the header step label shows `· · ·` instead of a step name.

Data sources: `GET /api/phase2/layer/:depth/definition`, `GET /api/phase2/layer/:depth/nodes`, `GET /api/state/layer/:depth/status`, `GET /api/state/timeline` (filtered by depth in event payload).

The `useCurrentStep(depth)` hook derives the step and returns `{ step: string | null, status: 'ready' | 'deriving' }` — the step label string and which Step tab content variant to render.

---

## 5. Phase 1 Screen — `/`

### 5.1 Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [▪] intent tree                                    phase 1  ·  5 / 8  │
├────────────────────────────────────┬────────────────────────────────────┤
│                                    │                                    │
│  CHAT                              │  SPEC DOC                         │
│                                    │                                    │
│  ┌──────────────────────────────┐  │  §I   problem statement           │
│  │ agent                        │  │       Ship a URL shortener...     │
│  │ What hard constraints can't  │  │                                    │
│  │ we violate?                  │  │  §II  hard constraints            │
│  └──────────────────────────────┘  │       Must run on existing K8s... │
│                                    │                                    │
│  ┌──────────────────────────────┐  │  §III optimization targets        │
│  │ you                          │  │       — empty —                   │
│  │ Same K8s. Reuse OIDC. No new │  │                                    │
│  │ DB vendors.                  │  │  §IV  success criteria            │
│  └──────────────────────────────┘  │       — empty —                   │
│                                    │                                    │
│  ┌──────────────────────────────┐  │  §V   out of scope                │
│  │ sys                          │  │       — empty —                   │
│  │ conflict_check · 1 tension   │  │                                    │
│  └──────────────────────────────┘  │  §VI  assumptions                 │
│                                    │       — empty —                   │
│                                    │                                    │
│                                    │  §VII nfrs                        │
│                                    │       — empty —                   │
│                                    │                                    │
│                                    │  §VIII existing context           │
│                                    │       — empty —                   │
│                                    │                                    │
│                                    ├────────────────────────────────────┤
├────────────────────────────────────┤  [run conflict check]  [lock ↗]  │
│  [____________ message __________]→│                                    │
└────────────────────────────────────┴────────────────────────────────────┘
```

Split is 50/50 horizontally. Both columns scroll independently. Header is fixed.

### 5.2 Header

- Brand mark + `intent tree` (left, `--acc`, JetBrains Mono)
- `phase 1 · N/8` field count (right of divider, `--tx2`, mono)
- Right: pulsing dot when LLM call is in flight

### 5.3 Chat panel

Turn types:

| Role | Label style | Body style |
|------|-------------|------------|
| `you` | `--acc`, uppercase mono | `--s2` bg, `--acc` border tint |
| `agent` | `--tx2`, uppercase mono | `--s2` bg, `--bdr` border |
| `sys` | `--tx3`, uppercase mono | no background, no border, mono body |

- `sys` turns are used for system events: conflict_check results, phase gate notifications
- Input and Send disabled while an LLM call is in flight
- Sending calls `POST /api/phase1/message`; response appended as `agent` turn
- The message endpoint returns `{ message, spec, clean, conflicts }` — when all 8 fields are populated, the backend auto-runs a conflict check and returns the result inline. If `clean: false`, conflict tensions are appended as a `sys` turn immediately after the agent reply.
- The dedicated `POST /api/phase1/conflict-check` endpoint can also be triggered manually via the action bar button; its results are appended as a `sys` turn with each tension listed

### 5.4 Spec panel

- All 8 fields always rendered, section numbers (`§I` through `§VIII`) in `--bdr-hi` mono
- Filled field: `--tx1` body text
- Empty field: `— empty —`, `--tx3`, italic
- Fields are **not** directly editable — all edits happen through conversation
- Fields animate in when first populated (fade + slight upward shift)

### 5.5 Action bar

Below the spec panel, always visible:

- **Run conflict check:** enabled when all 8 fields are non-empty. Calls `POST /api/phase1/conflict-check`. Conflict results appear below the spec fields in a warning block (amber border, `--bg-proposed` bg). Each conflict has `{ fields, tension, question }` — `fields` lists which spec fields conflict (e.g., `["hard_constraints", "nfrs"]`), shown as labels above the tension text, followed by the clarifying question. Hidden once `clean: true` — but reappears if a subsequent message updates the spec (the frontend tracks the spec's last-modified state and resets the clean flag whenever the spec changes after a clean check).
- **Lock Phase 1 (`btn-pri`):** enabled only when conflict check returned `clean: true`. Calls `POST /api/phase1/lock`, then navigates to `/phase2`.

---

## 6. Phase 2 Screen — `/phase2`

### 6.1 Layout

```
┌────────────────────────────────────────────────────────────────────────────┐
│  [▪] intent tree         phase 2 · layer 2 · validation        ● 1 fail  │
├─────────────┬──────────────────────────────────────┬───────────────────────┤
│             │                                      │  Step   Node   Spec  │
│  SIDEBAR    │                                      ├───────────────────────┤
│             │                                      │                       │
│  ▾ L0      │                                      │                       │
│    root     │           DAG CANVAS                 │   RIGHT PANEL         │
│             │                                      │   (contextual)        │
│  ▾ L1      │   ┌──────────┐                       │                       │
│    svc-a    │   │ L0-root  │                       │                       │
│    svc-b    │   └────┬─────┘                       │                       │
│             │        │              │              │                       │
│  ▾ L2      │   ┌────┴─────┐  [if]  ┌┴─────────┐  │                       │
│    mod-x    │   │L1-svc-a  │──────-─│ L1-svc-b │  │                       │
│    mod-y ✕  │   └────┬─────┘        └────┬──────┘  │                       │
│    mod-z    │        │                   │          │                       │
│             │   ┌────┴─────┐        ┌────┴──────┐  │                       │
│  ─────────  │   │ L2-mod-x │        │ L2-mod-y  │  │                       │
│  EVENTS     │   └──────────┘        └───────────┘  │                       │
│  14:22:04   │                                      │                       │
│  api.ok     │                                      │                       │
│  14:22:13   │                                      │                       │
│  llm.ok     │                                      │                       │
└─────────────┴──────────────────────────────────────┴───────────────────────┘
```

Three regions: sidebar (220px), DAG canvas (flex), right panel (300px).

### 6.2 Header

Fixed, 42px. Same brand mark as Phase 1.

- `phase 2 · layer N · <step>` — updates as the loop progresses. Step is derived client-side (see Section 4.6)
- Step label values: `idle` · `layer definition` · `node proposals` · `validation` · `edge validation` · `collective check` · `syntax check` · `leaf determination` · `locked` · `phase2 complete`
- Badges: node count, proposed/failed count derived from display states (see Section 4.5) — amber for proposed, red for failed
- Pulsing teal dot when any LLM call is in flight

---

## 7. Left Sidebar

220px. Two modes switched by icon tabs at the top of the sidebar.

```
┌──────────────────────┐
│  [🌲]  [≡]           │  ← mode icons: tree / events
├──────────────────────┤
│                      │
│  (mode content)      │
│                      │
└──────────────────────┘
```

### 7.1 Mode 1 — Layer tree (default)

Collapsible sections per depth level. Layer name shown in section header.

```
  ▾ L0 · System
      L0-url-shortener            ● locked

  ▾ L1 · Service
      L1-redirect-plane           ● locked
      L1-write-plane              ● locked

  ▾ L2 · Module
      L2-cache-edge               ◐ proposed
      L2-storage-primary          ◐ proposed
      L2-auth-bridge              ✕ failed
      L2-write-adapter            · pending
```

- Section header: layer depth + layer name in `--tx3` mono, uppercase. Layer names come from `useStack` — the stack's `layers` array contains `{ layer, description, reasoning }` per depth, where `layer` is the layer name.
- Node rows: ID (truncated with ellipsis), state dot aligned right
- State dots use derived display states (see Section 4.5): `·` pending (grey faint), `◐` proposed (amber), `✓` passed (green), `✕` failed (red), `●` locked (grey), `⊘` invalidated (strikethrough)
- Selected node: `--acc` 2px left border on the row
- Clicking a row: selects the node in the DAG, pans the canvas to it, switches right panel to Node tab

### 7.2 Mode 2 — Event stream

Live tail of `GET /api/state/timeline`, polled every 3s.

```
  14:22:04  spec_field_updated      hard_constraints
  14:22:04  spec_field_updated      nfrs
  14:22:11  conflict_detected       lat↔OIDC           2.1s
  14:22:13  conflict_resolved       lat↔OIDC
  14:22:14  phase1_locked
  14:22:16  layer_started           depth: 0
```

Columns: timestamp · event type (coloured by kind) · payload summary · duration (right-aligned, computed from pairs of `_attempted` → `_passed`/`_failed` events for the same depth/node).

The backend `EventRecord` has `{ id, type, timestamp, actor, node_ids, payload }` — there is no `kind` or `message` field. The frontend maps event types to display kinds:

| Event type pattern | Kind | Colour |
|--------------------|------|--------|
| `*_started`, `*_attempted`, `layer_defined`, `node_proposed`, `edge_proposed` | `info` | `--tx2` |
| `*_passed`, `*_locked`, `*_approved`, `*_confirmed`, `phase1_locked`, `phase2_locked` | `ok` | `--passed` |
| `conflict_detected`, `*_overridden`, `node_claimed`, `collective_vertical_failed` | `warn` | `--proposed` |
| `*_failed`, `node_invalidated`, `edge_invalidated`, `node_claim_rejected`, `upward_traversal_triggered` | `error` | `--failed` |

The payload summary column is extracted from the event's JSON `payload` field — show the first relevant key (e.g., `node_id`, `depth`, `tension`, `classification`). Truncate to fit.

- Monospace throughout
- Auto-scrolls to bottom unless user has scrolled up
- New events fade in at bottom

---

## 8. DAG Canvas

Built with ReactFlow. Takes all remaining horizontal space between sidebar and right panel.

### 8.1 Background

Subtle dot grid using CSS `background-image` on the `.react-flow__background` element. Same dark tone as `--bg`.

### 8.2 Layout

Dagre with `rankdir: LR` (left to right). Each layer depth is one rank. Nodes within a rank are stacked vertically with a fixed gap.

Column headers rendered as non-interactive labels above each rank: `L0 · System`, `L1 · Service`, etc., in `--tx3` mono uppercase. Layer names come from `useStack` (same source as sidebar — see Section 7.1). Positioned using ReactFlow's `useViewport()` hook to transform Dagre layout coordinates into screen coordinates — headers must stay aligned with their rank during pan/zoom.

Layout re-runs (and ReactFlow animates positions) whenever the node set or edge set changes.

**Auto-fit:** when new nodes appear, fit the view to the full graph with padding. After that, user controls pan/zoom freely. Minimum zoom: 0.3. Maximum zoom: 1.5.

### 8.3 Node card component

```
┌──────────────────────────────────────────────┐
│  L2-cache-edge                      proposed │
│                                              │
│  Edge-local Redis replica. Serves            │
│  redirects without crossing the OIDC         │
│  plane.                                      │
│                                              │
│  in: code string      out: redirect_url str  │  ← leaf layer only
└──────────────────────────────────────────────┘
```

Structure:
- **Top-left:** node ID, `JetBrains Mono` 9px, `--tx3` (state-coloured when non-locked)
- **Top-right:** state label, `JetBrains Mono` 8px, state colour
- **Body:** intent text, `Inter Tight` 11.5px, `--tx1`, clamped to 3 lines with `overflow: hidden`
- **Bottom row (leaf layer only):** `in:` and `out:` typed signature chips, `JetBrains Mono` 10px, `--tx3`; truncated with ellipsis
- **Corner ticks:** SVG path decorations on all four corners (from synthesis.html)

State styling uses **display states** (see Section 4.5), not raw backend states:

| Display state | Border | Background |
|---------------|--------|------------|
| `pending` | `--bdr` | `--s2` |
| `proposed` | `--proposed` 1.5px | `--bg-proposed` |
| `passed` | `--passed` 1.5px | `--bg-passed` |
| `failed` | `--failed` 1.5px | `--bg-failed` |
| `locked` | `--locked` | `--bg-locked` |
| `invalidated` | `--bdr` dashed | `--bg` |

Selected overlay: `--acc` border, 2px, regardless of state.

`invalidated` nodes have their ID rendered with CSS `text-decoration: line-through`.

### 8.4 Hierarchy lines (parent → child)

These are **not** edges in the spec's sense. They are purely visual connectors showing the decomposition structure. They carry no data and are not interactive.

- ReactFlow edge type: `step` (elbow connector, fits layered layout)
- Stroke: `--bdr-hi`, 1.5px
- Arrow marker at child end
- No label
- No click handler — requires a **custom ReactFlow edge type** that renders the SVG path with `pointer-events: none` on the path element itself. ReactFlow's built-in edge types attach click handlers at the SVG path level, so `pointer-events: none` on the wrapper component is not sufficient.

When a node is selected, hierarchy lines connected to it are highlighted (`--acc`, 0.5 opacity).

### 8.5 Sibling edges (interface contracts)

These **are** edges in the spec's sense. Horizontal connections between nodes at the same depth. They carry interface contract data and are interactive.

#### Path

ReactFlow edge type: `smoothstep` or custom bezier, arcing above or below the node row to avoid overlapping hierarchy lines. The arc direction (above/below) is determined by relative vertical position of source and target.

Stroke: `--bdr-hi`, 1.5px default. Selected: `--acc`, 1.5px.

#### Inline label (EdgeLabelRenderer)

Rendered at the midpoint of the edge path via ReactFlow's `EdgeLabelRenderer`. Stays anchored as the user pans/zooms.

```
                    ┌──────────────────────────┐
  [L1-svc-a] ───── │ invalidateCache(code)  → │ ───── [L1-svc-b]
                    └──────────────────────────┘
```

Label pill:
- Background: `--s2`
- Border: `--bdr` (selected: `--acc`)
- Font: `JetBrains Mono` 10px
- Content: truncated `interface` field + direction indicator (`→` directed, `↔` bidirectional)
- Max width: 160px; truncates with ellipsis

At the **leaf layer**, the pill shows the typed contract. A small expand affordance `[↗]` appears on the right; clicking it opens the full contract in the right panel Node tab.

#### Bidirectional edges

The backend stores bidirectional edges with `direction: "bidirectional"` on a single edge record. The frontend renders these with `↔`. If the backend stores two directed edges between the same source/target pair, the frontend collapses them into one rendered edge with `↔` — the label pill shows both interfaces separated by ` / ` (truncated to fit the 160px max width).

#### Interaction

- Clicking the edge path or its label pill: selects the edge, switches right panel to Node tab (edge inspector content)
- Selected edge: pill border → `--acc`, stroke → `--acc`

---

## 9. Right Panel

300px, fixed. Three tabs.

```
┌───────────────────────────────────────────┐
│  Step ●          Node          Spec       │
├───────────────────────────────────────────┤
│                                           │
│  (tab content)                            │
│                                           │
└───────────────────────────────────────────┘
```

Tab bar: 34px, `--bdr` bottom. Active tab has `--acc` bottom underline. Dot indicator on Step tab when a human action is pending.

Tab switching rules:
- Clicking a node in the DAG → Node tab, node inspector content
- Clicking an edge in the DAG → Node tab, edge inspector content
- Clicking canvas background → stays on current tab, clears selection
- Clicking a node row in the sidebar → Node tab, node inspector content
- New human gate opens → dot appears on Step tab; tab does not auto-switch (user controls)

---

## 10. Step Tab

The active human gate for the current loop position. Content is determined by the derived step (see Section 4.6). Each state maps to a specific point in the Phase 2 layer iteration loop (see `docs/intent-tree.md` Section 6).

When no action is pending (e.g. validation is running automatically), the Step tab shows a progress indicator for the current automated step.

### 10.1 Idle / automated step running

```
  PHASE 2 · L2

  ◌  Validation running...
     3 / 4 nodes checked

  This step runs automatically.
  You will be prompted when action is needed.
```

### 10.2 Layer definition

Triggered after `POST /api/phase2/layer/:depth/definition/generate` returns. Fields are editable inline before approval.

```
  LAYER DEFINITION · L2
  ─────────────────────────────────────────
  Layer name
  ┌─────────────────────────────────────┐
  │ Module Layer                        │
  └─────────────────────────────────────┘

  Responsibility scope
  ┌─────────────────────────────────────┐
  │ Internal building blocks within a  │
  │ service. Concerns that cannot be   │
  │ collapsed further into a single    │
  │ deployable unit.                   │
  └─────────────────────────────────────┘

  Considerations
  ┌─────────────────────────────────────┐
  │ ...                                │
  └─────────────────────────────────────┘

  Out of scope
  ┌─────────────────────────────────────┐
  │ ...                                │
  └─────────────────────────────────────┘

  Checklist template
  · Node intent stays within parent scope
  · No hard-constraint violation
  · Edges well-defined

  [Edit]                    [Approve ↗]
```

Approve sends `POST .../definition/approve`. If the user edited fields, the body includes the changed fields: `{ layer_name, responsibility_scope, considerations, out_of_scope, checklist_template }` (partial — only include modified fields). If no edits, send empty body to accept the generated definition as-is. Edit mode makes textareas editable.

### 10.3 Node proposals

Triggered after `POST /api/phase2/layer/:depth/nodes/propose` returns.

```
  NODE PROPOSALS · L2
  4 nodes proposed
  ─────────────────────────────────────────
  ┌─────────────────────────────────────┐
  │ L2-cache-edge                       │
  │ Edge-local Redis replica. Serves    │
  │ redirects without crossing OIDC.    │
  │                                     │
  │ CHECKLIST                           │
  │ · Stays within parent intent        │
  │ · No hard-constraint violation      │
  └─────────────────────────────────────┘

  ┌─────────────────────────────────────┐
  │ L2-storage-primary                  │
  │ Authoritative short-code store.     │
  │ PostgreSQL primary with replicas.   │
  │                                     │
  │ CHECKLIST                           │
  │ · Stays within parent intent        │
  │ · No new DB vendor                  │
  └─────────────────────────────────────┘

  (+ 2 more)

              [Approve all ↗]
```

Each node card is expandable to show full checklist items and edit them. The full list scrolls within the tab. Approve calls `POST .../nodes/approve`.

### 10.4 Validation in progress

Shown while validation is running (polling node states). Not a human gate — but gives visibility.

```
  VALIDATION · L2
  ─────────────────────────────────────────
  ✓  L2-cache-edge           passed
  ✓  L2-storage-primary      passed
  ✕  L2-auth-bridge          2 failing
  ·  L2-write-adapter        pending

  [Diagnose L2-auth-bridge ↗]
```

Live — polls `GET /api/phase2/layer/:depth/nodes` every 3s (see Section 13.1). Node pass/fail status is determined by derived display state (Section 4.5) — a node whose most recent validation event is `node_validation_passed` shows `✓`, one with `node_validation_failed` shows `✕`. Diagnose button appears immediately when any node fails. Multiple failing nodes show multiple diagnose buttons.

### 10.5 Edge validation result

Triggered after `POST /api/phase2/layer/:depth/validate/edges` returns. Fires after all nodes pass individual validation, before collective check.

```
  EDGE VALIDATION · L2
  ─────────────────────────────────────────
  ✕  L1-svc-a → L1-svc-b
     interface_incompatible
     source outputs JSON but target expects protobuf

  ✓  L1-svc-b → L1-svc-c

  MISSING EDGES
  L1-svc-a → L1-svc-c
  "svc-a produces events that svc-c must consume"
  interface: EventStream<OrderEvent> · directed

  [Re-run edge validation]
```

Shows each existing edge with pass/fail status. Failed edges list issue types (`interface_incompatible`, `direction_incorrect`, `interface_vague`) with descriptions. Missing edges show rationale and suggested interface/direction.

If edge validation passed, this state is skipped and the Step tab advances to collective check automatically.

### 10.6 Failure diagnosis

Triggered after `POST /api/phase2/diagnose/:nodeId` returns.

```
  FAILURE DIAGNOSIS
  ─────────────────────────────────────────
  Node: L2-auth-bridge

  FAILED CHECKS
  ✕  No hard-constraint violation
     "introduces edge nodes — confirm with ops"

  CLASSIFICATION
  ● implementation error
  ○ design error

  REASONING
  The node's definition assumes edge K8s nodes
  are available, which conflicts with the hard
  constraint to use the existing cluster only.
  This is a local definition error — the node
  can be fixed without invalidating parents.

  ORIGIN NODES
  — (implementation error, none)

  [Override ↕]           [Confirm ↗]
```

Override lets the user flip the classification. Confirm calls `POST /api/phase2/diagnose/:nodeId/confirm`. For **implementation errors**: send empty body `{}` to accept, or `{ "classification": "design" }` to override to design error. For **design errors**: send `{ "origin_nodes": ["nodeId", ...] }` if the user edited the origin list, or empty body to accept. Do not send `origin_nodes` for implementation errors — it's dead weight.

After confirm on an **implementation error**, a Rewrite button appears:

```
  REWRITE QUEUED

  L2-auth-bridge will be rewritten
  based on the failed checklist items.
  Auto-revalidates after rewrite.

  [Rewrite ↗]
```

Rewrite calls `POST /api/phase2/diagnose/:nodeId/rewrite`. After rewrite, validation reruns automatically.

After confirm on a **design error**, upward traversal is shown:

```
  DESIGN ERROR CONFIRMED

  Origin nodes
  · L1-write-plane

  The following nodes will be invalidated:
  · L1-write-plane
  · L2-auth-bridge
  · L2-write-adapter

  [Trigger upward traversal ↗]
```

Trigger calls `POST /api/phase2/traverse/upward` with `{"origin_nodes": [...]}`.

### 10.7 Collective vertical check result

Triggered after `POST /api/phase2/layer/:depth/validate/collective` returns with failures.

```
  COLLECTIVE CHECK · L2
  ─────────────────────────────────────────
  ✕  L1-write-plane — gap found
     "No child node covers durable storage
      for delete operations."

  ✓  L1-redirect-plane — fully covered

  NO OVERLAPS DETECTED

  [Re-propose for L1-write-plane ↗]
```

Re-propose is a two-step flow. Each "Re-propose" button calls `POST /api/phase2/layer/:depth/nodes/repropose/parent/:parentId`, which queues proposals for that parent. If multiple parents have gaps, each button accumulates into a pending batch. Once all needed re-proposals are queued, a single "Approve re-proposals" button calls `POST /api/phase2/layer/:depth/nodes/repropose/approve` to commit the full batch. The new nodes then go through the same validation flow, and the collective check reruns.

If collective check passed, this state is skipped and the Step tab advances automatically.

### 10.8 Syntax check result

Triggered after `POST /api/phase2/layer/:depth/validate/syntax` returns with errors.

```
  SYNTAX CHECK · L2
  ─────────────────────────────────────────
  ✕  Orphaned node
     L2-write-adapter has no parent

  ✕  Invalid edge target
     edge#4 references L2-nonexistent

  2 structural errors — fix and re-validate.

  [Re-run syntax check]
```

No automated resolution — the user must fix via node edit (`PATCH /api/phase2/layer/:depth/node/:nodeId`) or the LLM rewrite flow. After fixing, the "Re-run syntax check" button calls `POST /api/phase2/layer/:depth/validate/syntax` again. If syntax passes, the frontend auto-triggers layer lock (see Section 4.6 rule 9), then advances to leaf determination.

### 10.9 Leaf determination

Triggered after `POST /api/phase2/layer/:depth/leaf/determine` returns.

```
  LEAF DETERMINATION · L2
  ─────────────────────────────────────────
  L2-cache-edge
  [● leaf]  [○ decompose further]
  "Single block of logic — serves redirect
   with no internal sub-components."

  L2-storage-primary
  [● leaf]  [○ decompose further]
  "Atomic. One store, one read path."

  L2-auth-bridge
  [○ leaf]  [● decompose further]
  "Contains token validation, a cache layer,
   and an error handler — three related blocks
   that interact with each other."

  L2-write-adapter
  [● leaf]  [○ decompose further]
  "Single translation function. Leaf."

  ─────────────────────────────────────────
                          [Confirm ↗]
```

Toggle buttons per node. Confirm sends `POST .../leaf/confirm` with body `{"overrides": {"nodeId": "leaf" | "decompose_further"}}`. Only include nodes the user toggled — omitted nodes accept the LLM determination. Send empty body `{}` to accept all LLM determinations as-is.

### 10.10 Layer complete

Shown after leaf determinations are confirmed (`POST .../leaf/confirm`). The layer was auto-locked before leaf determination (see Section 4.6 rule 9). After confirm, the frontend calls `GET /api/phase2/exit-check` to determine if more layers are needed.

If `exit-check` returns `complete: false`:

```
  LAYER COMPLETE · L2
  ─────────────────────────────────────────
  4 nodes locked
  2 leaves · 2 decompose further

  NEXT LAYER
  L3 will decompose:
  · L2-cache-edge
  · L2-auth-bridge

  [Generate L3 definition ↗]
```

The `decompose_further_ids` from the exit check populate the "will decompose" list. "Generate L3 definition" triggers `POST /api/phase2/layer/:depth/definition/generate` for the next depth.

If `exit-check` returns `complete: true`, the frontend shows a "Lock Phase 2" button that calls `POST /api/phase2/lock`.

### 10.11 Phase 2 complete

Shown after `POST /api/phase2/lock` succeeds.

```
  PHASE 2 COMPLETE
  ─────────────────────────────────────────
  Architecture locked.

  N nodes across M layers.
  All nodes are locked leaves or have
  locked children.

  Phase 3 (implementation handoff)
  is not yet available in V1.
```

Read-only. No further actions in V1.

---

## 11. Node Tab

Shows the inspector for the currently selected node or edge. Empty state when nothing is selected.

### 11.1 Empty state

```
  ─────────────────────────────────────────
  No node selected.
  Click a node or edge in the canvas.
  ─────────────────────────────────────────
```

### 11.2 Node inspector

```
  L2-cache-edge
  ─────────────────────────────────────────
  Edge-local Redis replica. Serves redirects
  without crossing the OIDC plane.

  STATE
  ◐ proposed

  PARENTS
  L1-redirect-plane

  INPUTS
  code: string

  OUTPUTS
  redirect_url: string

  OUTBOUND EDGES
  → L2-storage-primary
    via onMiss(code)

  CHECKLIST
  ✓  Stays within parent intent
     redirect plane only
  ✕  No hard-constraint violation
     introduces edge nodes — confirm with ops

  [Diagnose]     [Edit node]
```

- Diagnose button: only when node has failed checklist items. Calls diagnose endpoint and switches Step tab to diagnosis state.
- Edit node: opens inline edit mode for intent / inputs / outputs. Saves via `PATCH /api/phase2/layer/:depth/node/:nodeId`. Backend emits `human_override` event.

### 11.3 Edge inspector

Edges connect nodes at the **same depth only** (see `intent-tree.md` Section 4.3 — no cross-layer edges).

```
  edge · L1-redirect-plane → L1-write-plane
  ─────────────────────────────────────────
  INTERFACE
  invalidateCache(code)

  DIRECTION
  directed →

  SOURCE
  L1-redirect-plane

  TARGET
  L1-write-plane
```

At the leaf layer, interface is the full typed contract:

```
  INTERFACE
  GET /cache/lookup
  body: { code: string }
  returns: { url: string | null }
```

No edit affordance for edges in V1 — edges are managed through the node proposal flow.

---

## 12. Spec Tab

Full Phase 1 spec document, read-only. Same visual treatment as the Phase 1 spec panel.

Always accessible during Phase 2 as a reference. Never changes after Phase 1 locks.

```
  PHASE 1 SPEC
  sealed · 8/8
  ─────────────────────────────────────────
  §I   problem statement
       Ship a URL shortener serving 10k QPS
       with sub-50ms redirect latency at p99.

  §II  hard constraints
       Must run on existing Kubernetes cluster.
       No new DB vendors. Reuse internal OIDC.

  §III optimization targets
       ...

  (scrollable)
```

---

## 13. Data Layer

### 13.1 TanStack Query setup

One `QueryClient` at the app root. Cache time 5 minutes. All API calls go through typed `useQuery` / `useMutation` hooks — no raw `fetch` calls in components.

Key queries and their refetch strategy:

| Hook | Endpoint | Interval |
|------|----------|----------|
| `useSpec` | `GET /api/phase1/spec` | on focus |
| `useSession` | `GET /api/state/session` | 5s |
| `useStack` | `GET /api/phase2/stack` | `staleTime: Infinity`, refetch on mutation success (feeds sidebar headers + column headers — must not go stale on re-mount) |
| `useLayerDefinition(depth)` | `GET /api/phase2/layer/:depth/definition` | on demand |
| `useLayerNodes(depth)` | `GET /api/phase2/layer/:depth/nodes` | 3s during validation, on focus otherwise |
| `useTimeline` | `GET /api/state/timeline` | 3s |
| `useLayerStatus(depth)` | `GET /api/state/layer/:depth/status` | on demand |
| `useNodeHistory(nodeId)` | `GET /api/state/node/:nodeId/history` | on demand (for display state derivation) |

The `useLayerNodes` hook switches its `refetchInterval` based on the derived step (see Section 4.6) — 3s when the derived step is `validation`, disabled otherwise.

**Edge data:** Available through two paths:
1. `GET /api/phase2/layer/:depth/edges` — returns all edge objects at a given depth as `{ edges: ArchEdge[] }`
2. The nodes endpoint (`GET /api/phase2/layer/:depth/nodes`) populates each node's `edges` array with `{ id, target, interface, direction }` objects for all edges connected to that node

The nodes endpoint also includes `inputs`, `outputs`, and `leaf` fields on each node view.

### 13.2 Mutations

Every human gate action is a `useMutation`. On success, the relevant queries are invalidated to trigger a refetch. No optimistic updates in V1 — wait for server confirmation before updating UI.

Mutation loading state drives button disabled + spinner.

### 13.3 Polling

Polling is scoped — only the queries that need live data poll, and only when relevant. `useTimeline` polls constantly in Phase 2. `useLayerNodes` polls only when the derived step is `validation`. `useSession` polls every 5s to detect phase transitions and depth changes; step transitions are detected by the `useCurrentStep` hook (Section 4.6) which depends on layer status and timeline data, not the session endpoint.

### 13.4 Error handling

All API responses follow the `{ ok, data, llm_raw }` / `{ ok: false, error }` envelope. On `ok: false`:

- **Phase 1 chat:** error message shown as a `sys` turn with `--failed` colour in the chat panel
- **Phase 2 mutations (approve, validate, diagnose, etc.):** toast notification at the top-right of the screen, auto-dismiss after 5s. Button re-enables so the user can retry.
- **LLM timeouts / parse failures:** same toast pattern. The `llm_raw` field (when present) is available in the browser console for debugging but not surfaced in the UI.

Note: The backend error envelope uses `{ ok: false, error: "message string" }` — a flat string, not `{ code, message }`. The frontend should handle this shape.

---

## 14. Key Interactions Summary

| Trigger | Effect |
|---------|--------|
| Click node card in DAG | Select node, right panel → Node tab, parent hierarchy lines highlight |
| Click sibling edge / pill | Select edge, right panel → Node tab (edge inspector) |
| Click canvas background | Deselect, tab stays |
| Click node row in sidebar | Select node in DAG, pan canvas to node, right panel → Node tab |
| Step tab dot indicator | Pulsing teal dot when human action required |
| New layer added | Dagre re-layouts, ReactFlow animates, column header appears |
| Node state change | Display state re-derived (Section 4.5), card re-renders with new colours, sidebar dot updates |
| Invalidation cascade | All affected nodes animate to `invalidated` state simultaneously |
| LLM call in flight | Primary buttons disabled + spinner, header dot pulses |
| Phase 1 lock | Navigate to `/phase2`, Phase 2 screen initialises from session state |
