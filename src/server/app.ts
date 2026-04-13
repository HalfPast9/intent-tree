import express from "express";
import path from "node:path";

import {
  getAbstractionStackById,
  getAnySession,
  getEventHistory,
  getFullTimeline,
  getLayerCriteriaDocByDepth,
  getNodeChecklistDraftsByDepth,
  getNodesByDepth,
  getProblemSpecById
} from "../db/index.js";
import { resetApplicationData, seedDefaultPhase1Data } from "../dev/maintenance.js";
import { LLMResponseParseError, getLLMRawLogLength, getLLMRawSince } from "../llm/client.js";
import {
  getOrCreatePhase1Spec,
  lockPhase1,
  processUserMessage,
  runConflictCheck
} from "../phase1/service.js";
import {
  approveLayerCriteria,
  approveLayerNodes,
  approveStack,
  approveStackEvolution,
  ensureDefaultSession,
  generateLayerCriteria,
  proposeLayerNodes,
  proposeStack,
  getStackEvolutionProposal,
  peekPendingStackEvolution
} from "../phase2/service.js";

const publicDir = path.resolve(process.cwd(), "public");
type Envelope = {
  ok: boolean;
  data: Record<string, unknown>;
  llm_raw: string | null;
};

function ok(data: Record<string, unknown>, llmRaw: string | null = null): Envelope {
  return {
    ok: true,
    data,
    llm_raw: llmRaw
  };
}

function parseDepth(value: unknown): number | null {
  const depth = Number(value);

  if (!Number.isInteger(depth) || depth < 0) {
    return null;
  }

  return depth;
}

function parseLayers(value: string): Array<{ layer: string; description: string; reasoning: string }> {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
          return null;
        }

        const layer = typeof entry.layer === "string" ? entry.layer : "";
        const description = typeof entry.description === "string" ? entry.description : "";
        const reasoning = typeof entry.reasoning === "string" ? entry.reasoning : "";

        if (!layer || !description || !reasoning) {
          return null;
        }

        return { layer, description, reasoning };
      })
      .filter((entry): entry is { layer: string; description: string; reasoning: string } => entry !== null);
  } catch {
    return [];
  }
}

async function getCurrentStackView(): Promise<{ id: string; locked: boolean; layers: Array<{ layer: string; description: string; reasoning: string }> } | null> {
  const session = await getAnySession();

  if (!session?.stack_id) {
    return null;
  }

  const stack = await getAbstractionStackById(session.stack_id);

  if (!stack) {
    return null;
  }

  return {
    id: stack.id,
    locked: stack.locked,
    layers: parseLayers(stack.layers)
  };
}

async function getAllNodes(maxDepth = 20): Promise<Array<{ id: string; state: string; depth: number }>> {
  const all: Array<{ id: string; state: string; depth: number }> = [];
  let emptyStreak = 0;

  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const nodes = await getNodesByDepth(depth);

    if (!nodes.length) {
      emptyStreak += 1;

      if (emptyStreak >= 3) {
        break;
      }

      continue;
    }

    emptyStreak = 0;
    all.push(...nodes.map((node) => ({ id: node.id, state: node.state, depth: node.depth })));
  }

  return all;
}

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.static(publicDir));

  app.get("/api/phase1/spec", async (_req, res, next) => {
    try {
      const spec = await getOrCreatePhase1Spec();
      res.json(ok({ spec }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase1/message", async (req, res, next) => {
    try {
      const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";

      if (!message) {
        res.status(400).json({ ok: false, error: { code: "bad_request", message: "Message is required." } });
        return;
      }

      const result = await processUserMessage(message);
      res.json(
        ok(
          {
            message: result.message,
            spec: result.spec,
            clean: result.clean,
            conflicts: result.conflicts
          },
          result.llm_raw
        )
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase1/conflict-check", async (_req, res, next) => {
    try {
      const { spec, result, llm_raw } = await runConflictCheck();
      res.json(
        ok(
          {
            spec,
            clean: result.clean,
            conflicts: result.conflicts
          },
          llm_raw
        )
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase1/lock", async (_req, res, next) => {
    try {
      const spec = await lockPhase1();
      res.json(ok({ success: true, spec }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/phase2/stack", async (_req, res, next) => {
    try {
      const session = await ensureDefaultSession();
      const stack = await getCurrentStackView();
      res.json(ok({ session, stack }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/stack/propose", async (_req, res, next) => {
    try {
      const rawLogStart = getLLMRawLogLength();
      const session = await ensureDefaultSession();
      const { layers } = await proposeStack();
      const llmRaw = getLLMRawSince(rawLogStart)[0] ?? null;

      res.json(
        ok(
          {
            session,
            stack: {
              id: null,
              locked: false,
              layers
            }
          },
          llmRaw
        )
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/stack/evolution/check", async (req, res, next) => {
    try {
      const depth = parseDepth(req.body?.depth ?? 0);

      if (depth === null) {
        res.status(400).json({ ok: false, error: { code: "bad_request", message: "Depth must be a non-negative integer." } });
        return;
      }

      const rawLogStart = getLLMRawLogLength();
      const proposal = await getStackEvolutionProposal(depth);
      const llmRaw = getLLMRawSince(rawLogStart)[0] ?? null;
      res.json(ok({ depth, stack_evolution_proposal: proposal }, llmRaw));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/stack/evolution/approve", async (req, res, next) => {
    try {
      const depth = parseDepth(req.body?.depth ?? 0);

      if (depth === null) {
        res.status(400).json({ ok: false, error: { code: "bad_request", message: "Depth must be a non-negative integer." } });
        return;
      }

      const proposedStack = Array.isArray(req.body?.proposed_stack) ? req.body.proposed_stack : undefined;
      const result = await approveStackEvolution({
        depth,
        proposed_stack: proposedStack
      });
      res.json(ok(result));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/stack/approve", async (req, res, next) => {
    try {
      const layers = Array.isArray(req.body?.layers) ? req.body.layers : undefined;
      const result = await approveStack({ layers });
      res.json(ok(result));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/layer/:depth/criteria/generate", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);

      if (depth === null) {
        res.status(400).json({ ok: false, error: { code: "bad_request", message: "Depth must be a non-negative integer." } });
        return;
      }

      const rawLogStart = getLLMRawLogLength();
      const criteria = await generateLayerCriteria(depth);
      const llmRaw = getLLMRawSince(rawLogStart)[0] ?? null;
      res.json(ok({ criteria }, llmRaw));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/phase2/layer/:depth/criteria", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);

      if (depth === null) {
        res.status(400).json({ ok: false, error: { code: "bad_request", message: "Depth must be a non-negative integer." } });
        return;
      }

      const criteria = await getLayerCriteriaDocByDepth(depth);
      res.json(ok({ criteria }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/layer/:depth/criteria/approve", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);

      if (depth === null) {
        res.status(400).json({ ok: false, error: { code: "bad_request", message: "Depth must be a non-negative integer." } });
        return;
      }

      const criteria = await approveLayerCriteria(depth, req.body ?? undefined);
      res.json(ok({ criteria }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/layer/:depth/nodes/propose", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);

      if (depth === null) {
        res.status(400).json({ ok: false, error: { code: "bad_request", message: "Depth must be a non-negative integer." } });
        return;
      }

      const rawLogStart = getLLMRawLogLength();
      const nodes = await proposeLayerNodes(depth);
      const llmRaw = getLLMRawSince(rawLogStart)[0] ?? null;
      res.json(ok({ nodes }, llmRaw));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/phase2/layer/:depth/nodes", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);

      if (depth === null) {
        res.status(400).json({ ok: false, error: { code: "bad_request", message: "Depth must be a non-negative integer." } });
        return;
      }

      const nodes = await getNodesByDepth(depth);
      res.json(ok({ nodes }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/layer/:depth/nodes/approve", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);

      if (depth === null) {
        res.status(400).json({ ok: false, error: { code: "bad_request", message: "Depth must be a non-negative integer." } });
        return;
      }

      const nodes = Array.isArray(req.body?.nodes) ? req.body.nodes : undefined;
      const result = await approveLayerNodes(depth, nodes);
      res.json(ok(result));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/state/session", async (_req, res, next) => {
    try {
      const session = await ensureDefaultSession();
      const spec = await getProblemSpecById(session.problem_spec_id);
      const stack = await getCurrentStackView();

      res.json(ok({ session, spec, stack }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/state/timeline", async (_req, res, next) => {
    try {
      const timeline = await getFullTimeline();
      res.json(ok({ timeline }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/state/node/:nodeId/history", async (req, res, next) => {
    try {
      const history = await getEventHistory(String(req.params.nodeId));
      res.json(ok({ node_id: String(req.params.nodeId), history }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/state/nodes/pending", async (_req, res, next) => {
    try {
      const nodes = await getAllNodes();
      res.json(ok({ nodes: nodes.filter((node) => node.state === "pending") }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/state/nodes/invalidated", async (_req, res, next) => {
    try {
      const nodes = await getAllNodes();
      res.json(ok({ nodes: nodes.filter((node) => node.state === "invalidated") }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/state/layer/:depth/status", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);

      if (depth === null) {
        res.status(400).json({ ok: false, error: { code: "bad_request", message: "Depth must be a non-negative integer." } });
        return;
      }

      const criteria = await getLayerCriteriaDocByDepth(depth);
      const nodes = await getNodesByDepth(depth);
      const drafts = await getNodeChecklistDraftsByDepth(depth);
      const pendingEvolution = peekPendingStackEvolution(depth);

      res.json(
        ok({
          depth,
          criteria_exists: Boolean(criteria),
          criteria_locked: Boolean(criteria?.locked),
          node_count: nodes.length,
          pending_nodes: nodes.filter((node) => node.state === "pending").length,
          invalidated_nodes: nodes.filter((node) => node.state === "invalidated").length,
          checklist_drafts: drafts.length,
          checklists_approved: drafts.filter((draft) => draft.approved).length,
          stack_evolution_pending: Boolean(pendingEvolution)
        })
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/dev/reset", async (_req, res, next) => {
    try {
      if (process.env.NODE_ENV === "production") {
        res.status(403).json({ ok: false, error: { code: "forbidden", message: "Dev reset endpoint is disabled in production." } });
        return;
      }

      const deleted = await resetApplicationData();
      res.json(ok({ reset: true, deleted_nodes: deleted }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/dev/seed", async (_req, res, next) => {
    try {
      if (process.env.NODE_ENV === "production") {
        res.status(403).json({ ok: false, error: { code: "forbidden", message: "Dev seed endpoint is disabled in production." } });
        return;
      }

      await seedDefaultPhase1Data();
      res.json(ok({ seeded: true }));
    } catch (error) {
      next(error);
    }
  });

  app.get("*", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof LLMResponseParseError) {
      res.status(502).json({ ok: false, error: { code: "llm_parse_error", message: error.message, details: error.raw } });
      return;
    }

    if (error instanceof Error) {
      res.status(400).json({ ok: false, error: { code: "bad_request", message: error.message } });
      return;
    }

    res.status(500).json({ ok: false, error: { code: "internal", message: "Unknown server error" } });
  });

  return app;
}
