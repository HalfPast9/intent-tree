import express from "express";
import path from "node:path";

import {
  getAbstractionStackById,
  getAnySession,
  getEventHistory,
  getFullTimeline,
  getLayerCriteriaDocByDepth,
  getNodeChecklistDraftsByDepth,
  getNodesByDepth
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
  generateLayerCriteria,
  getOrCreateProposedStack,
  getStackEvolutionProposal,
  proposeLayerNodes,
  proposeStack
} from "../phase2/service.js";

const publicDir = path.resolve(process.cwd(), "public");

type ApiEnvelope = {
  ok: boolean;
  data: Record<string, unknown>;
  llm_raw: string | null;
};

function ok(data: Record<string, unknown>, llmRaw: string | null = null): ApiEnvelope {
  return { ok: true, data, llm_raw: llmRaw };
}

function parseDepth(value: unknown): number | null {
  const depth = Number(value);
  if (!Number.isInteger(depth) || depth < 0) {
    return null;
  }

  return depth;
}

async function collectAllNodes(maxDepth = 20) {
  const nodes: Awaited<ReturnType<typeof getNodesByDepth>> = [];
  let emptyStreak = 0;

  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const atDepth = await getNodesByDepth(depth);

    if (!atDepth.length) {
      emptyStreak += 1;

      if (emptyStreak >= 3) {
        break;
      }

      continue;
    }

    emptyStreak = 0;
    nodes.push(...atDepth);
  }

  return nodes;
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
        res.status(400).json({ ok: false, error: "Message is required." });
        return;
      }

      const rawStart = getLLMRawLogLength();
      const result = await processUserMessage(message);
      const llmRaw = getLLMRawSince(rawStart)[0] ?? null;
      res.json(
        ok(
          {
            message: result.message,
            spec: result.spec,
            clean: result.clean,
            conflicts: result.conflicts
          },
          llmRaw
        )
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase1/conflict-check", async (_req, res, next) => {
    try {
      const rawStart = getLLMRawLogLength();
      const { spec, result } = await runConflictCheck();
      const llmRaw = getLLMRawSince(rawStart)[0] ?? null;
      res.json(ok({ spec, ...result }, llmRaw));
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
      const session = await getAnySession();
      const stack = session?.stack_id ? await getAbstractionStackById(session.stack_id) : null;

      res.json(ok({
        session,
        stack: stack
          ? {
              id: stack.id,
              locked: stack.locked,
              layers: JSON.parse(stack.layers)
            }
          : null
      }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/stack/propose", async (_req, res, next) => {
    try {
      const rawStart = getLLMRawLogLength();
      const result = await proposeStack();
      const llmRaw = getLLMRawSince(rawStart)[0] ?? null;
      res.json(ok({ session: result.session, stack: result.layers }, llmRaw));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/stack/evolution/check", async (req, res, next) => {
    try {
      const depth = parseDepth(req.body?.depth ?? 0);

      if (depth === null) {
        res.status(400).json({ ok: false, error: "Depth must be a non-negative integer." });
        return;
      }

      const rawStart = getLLMRawLogLength();
      const proposal = await getStackEvolutionProposal(depth);
      const llmRaw = getLLMRawSince(rawStart)[0] ?? null;
      res.json(ok({ depth, change_needed: proposal !== null, stack_evolution_proposal: proposal }, llmRaw));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/stack/evolution/approve", async (req, res, next) => {
    try {
      const depth = parseDepth(req.body?.depth ?? 0);

      if (depth === null) {
        res.status(400).json({ ok: false, error: "Depth must be a non-negative integer." });
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

  app.get("/api/phase2/layer/:depth/criteria", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);

      if (depth === null) {
        res.status(400).json({ ok: false, error: "Depth must be a non-negative integer." });
        return;
      }

      const criteria = await getLayerCriteriaDocByDepth(depth);
      res.json(ok({ criteria }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/layer/:depth/criteria/generate", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);

      if (depth === null) {
        res.status(400).json({ ok: false, error: "Depth must be a non-negative integer." });
        return;
      }

      const rawStart = getLLMRawLogLength();
      const criteria = await generateLayerCriteria(depth);
      const llmRaw = getLLMRawSince(rawStart)[0] ?? null;
      res.json(ok({ criteria }, llmRaw));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/layer/:depth/criteria/approve", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);

      if (depth === null) {
        res.status(400).json({ ok: false, error: "Depth must be a non-negative integer." });
        return;
      }

      const criteria = await approveLayerCriteria(depth, req.body ?? undefined);
      res.json(ok({ criteria }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/phase2/layer/:depth/nodes", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);

      if (depth === null) {
        res.status(400).json({ ok: false, error: "Depth must be a non-negative integer." });
        return;
      }

      const nodes = await getNodesByDepth(depth);
      const drafts = await getNodeChecklistDraftsByDepth(depth);

      const view = nodes.map((node) => ({
        id: node.id,
        intent: node.intent,
        parents: node.parents,
        edges: [],
        checklist: (() => {
          const raw = drafts.find((d) => d.node_id === node.id)?.checklist ?? "[]";

          try {
            const parsed = JSON.parse(raw) as unknown;
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })(),
        state: node.state
      }));

      res.json(ok({ nodes: view }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/layer/:depth/nodes/propose", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);

      if (depth === null) {
        res.status(400).json({ ok: false, error: "Depth must be a non-negative integer." });
        return;
      }

      const rawStart = getLLMRawLogLength();
      const nodes = await proposeLayerNodes(depth);
      const llmRaw = getLLMRawSince(rawStart)[0] ?? null;
      res.json(ok({ nodes }, llmRaw));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/layer/:depth/nodes/approve", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);

      if (depth === null) {
        res.status(400).json({ ok: false, error: "Depth must be a non-negative integer." });
        return;
      }

      const result = await approveLayerNodes(depth);
      res.json(ok(result));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/state/session", async (_req, res, next) => {
    try {
      const session = await getAnySession();
      res.json(ok({ session }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/state/timeline", async (_req, res, next) => {
    try {
      const events = await getFullTimeline();
      res.json(ok({ timeline: events }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/state/node/:nodeId/history", async (req, res, next) => {
    try {
      const history = await getEventHistory(req.params.nodeId);
      res.json(ok({ node_id: req.params.nodeId, history }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/state/nodes/pending", async (_req, res, next) => {
    try {
      const nodes = await collectAllNodes();
      res.json(ok({ nodes: nodes.filter((node) => node.state === "pending") }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/state/nodes/invalidated", async (_req, res, next) => {
    try {
      const nodes = await collectAllNodes();
      res.json(ok({ nodes: nodes.filter((node) => node.state === "invalidated") }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/state/layer/:depth/status", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);

      if (depth === null) {
        res.status(400).json({ ok: false, error: "Depth must be a non-negative integer." });
        return;
      }

      const criteria = await getLayerCriteriaDocByDepth(depth);
      const nodes = await getNodesByDepth(depth);

      res.json(
        ok({
          depth,
          criteria_locked: Boolean(criteria?.locked),
          nodes: nodes.map((node) => ({ id: node.id, state: node.state, intent: node.intent }))
        })
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/dev/reset", async (_req, res, next) => {
    try {
      if (process.env.NODE_ENV === "production") {
        res.status(403).json({ ok: false, error: "Not available in production" });
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
        res.status(403).json({ ok: false, error: "Not available in production" });
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
      res.status(502).json({ ok: false, error: error.message });
      return;
    }

    if (error instanceof Error) {
      res.status(400).json({ ok: false, error: error.message });
      return;
    }

    res.status(500).json({ ok: false, error: "Unknown server error" });
  });

  return app;
}
