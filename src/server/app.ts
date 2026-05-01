import express from "express";
import path from "node:path";

import {
  getAbstractionStackById,
  getAnySession,
  getEdgesByDepth,
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
  processUserMessageStream,
  runConflictCheck
} from "../phase1/service.js";
import {
  approveLayerDefinition,
  approveLayerNodes,
  confirmLeafNodes,
  confirmDiagnosis,
  determineLeafNodes,
  diagnoseNode,
  editNode,
  getExitCheckStatus,
  generateLayerDefinition,
  lockPhase2,
  lockLayer,
  proposeLayerNodes,
  reproposeParent,
  approveReproposeParent,
  rewriteNode,
  runCollectiveVerticalCheck,
  runLayerSyntaxCheck,
  traverseUpward,
  validateNode
} from "../phase2/service.js";

const clientDistDir = path.resolve(process.cwd(), "client/dist");

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

function serializeCriteriaDoc(doc: unknown) {
  if (!doc || typeof doc !== "object") return null;
  const d = doc as Record<string, unknown>;
  const raw = d.checklist_template;
  const checklist_template = typeof raw === "string" ? JSON.parse(raw) : raw;
  return { ...d, checklist_template };
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
  app.use(express.static(clientDistDir));

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

  app.post("/api/phase1/message/stream", async (req, res) => {
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";

    if (!message) {
      res.status(400).json({ ok: false, error: "Message is required." });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (event: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      await processUserMessageStream(message, send);
    } catch (error) {
      send({ type: "error", message: error instanceof Error ? error.message : "An error occurred." });
    } finally {
      res.end();
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
              layers: JSON.parse(stack.layers)
            }
          : null
      }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/phase2/layer/:depth/definition", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);

      if (depth === null) {
        res.status(400).json({ ok: false, error: "Depth must be a non-negative integer." });
        return;
      }

      const definition = await getLayerCriteriaDocByDepth(depth);
      res.json(ok({ definition: serializeCriteriaDoc(definition) }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/layer/:depth/definition/generate", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);

      if (depth === null) {
        res.status(400).json({ ok: false, error: "Depth must be a non-negative integer." });
        return;
      }

      const rawStart = getLLMRawLogLength();
      const definition = await generateLayerDefinition(depth);
      const llmRaw = getLLMRawSince(rawStart)[0] ?? null;
      res.json(ok({ definition: serializeCriteriaDoc(definition) }, llmRaw));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/layer/:depth/definition/approve", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);

      if (depth === null) {
        res.status(400).json({ ok: false, error: "Depth must be a non-negative integer." });
        return;
      }

      const definition = await approveLayerDefinition(depth, req.body ?? undefined);
      res.json(ok({ definition: serializeCriteriaDoc(definition) }));
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
      const allEdges = await getEdgesByDepth(depth);

      const view = nodes.map((node) => ({
        id: node.id,
        intent: node.intent,
        parents: node.parents,
        inputs: node.inputs,
        outputs: node.outputs,
        leaf: node.leaf ?? null,
        edges: allEdges
          .filter((e) => e.source === node.id || e.target === node.id)
          .map((e) => ({
            id: e.id,
            target: e.source === node.id ? e.target : e.source,
            interface: e.interface,
            direction: e.direction
          })),
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

  app.get("/api/phase2/layer/:depth/edges", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);

      if (depth === null) {
        res.status(400).json({ ok: false, error: "Depth must be a non-negative integer." });
        return;
      }

      const edges = await getEdgesByDepth(depth);
      res.json(ok({ edges }));
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

  app.post("/api/phase2/layer/:depth/nodes/repropose/parent/:parentId", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);
      if (depth === null) {
        res.status(400).json({ ok: false, error: "Depth must be a non-negative integer." });
        return;
      }
      const parentId = req.params.parentId;
      if (!parentId) {
        res.status(400).json({ ok: false, error: "Parent ID is required." });
        return;
      }
      const rawStart = getLLMRawLogLength();
      const result = await reproposeParent(depth, parentId);
      const llmRaw = getLLMRawSince(rawStart)[0] ?? null;
      res.json(ok({ depth, parent_id: parentId, nodes: result }, llmRaw));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/layer/:depth/nodes/repropose/approve", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);
      if (depth === null) {
        res.status(400).json({ ok: false, error: "Depth must be a non-negative integer." });
        return;
      }
      const result = await approveReproposeParent(depth);
      res.json(ok(result));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/layer/:depth/validate/node/:nodeId", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);
      if (depth === null) {
        res.status(400).json({ ok: false, error: "Depth must be a non-negative integer." });
        return;
      }

      const nodeId = req.params.nodeId;
      if (!nodeId) {
        res.status(400).json({ ok: false, error: "Node ID is required." });
        return;
      }

      const rawStart = getLLMRawLogLength();
      const result = await validateNode(depth, nodeId);
      const llmRaw = getLLMRawSince(rawStart)[0] ?? null;
      res.json(ok({ node_id: nodeId, ...result }, llmRaw));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/layer/:depth/validate/syntax", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);
      if (depth === null) {
        res.status(400).json({ ok: false, error: "Depth must be a non-negative integer." });
        return;
      }

      const result = await runLayerSyntaxCheck(depth);
      res.json(ok({ passed: result.passed, errors: result.errors }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/layer/:depth/validate/collective", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);
      if (depth === null) {
        res.status(400).json({ ok: false, error: "Depth must be a non-negative integer." });
        return;
      }

      const rawStart = getLLMRawLogLength();
      const result = await runCollectiveVerticalCheck(depth);
      const llmRaw = getLLMRawSince(rawStart)[0] ?? null;
      res.json(ok({ passed: result.passed, coverage: result.coverage, overlaps: result.overlaps }, llmRaw));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/layer/:depth/lock", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);
      if (depth === null) {
        res.status(400).json({ ok: false, error: "Depth must be a non-negative integer." });
        return;
      }

      const result = await lockLayer(depth);
      res.json(ok({ locked: result.locked, node_count: result.node_count }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/layer/:depth/leaf/determine", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);
      if (depth === null) {
        res.status(400).json({ ok: false, error: "Depth must be a non-negative integer." });
        return;
      }

      const rawStart = getLLMRawLogLength();
      const result = await determineLeafNodes(depth);
      const llmRaw = getLLMRawSince(rawStart)[0] ?? null;
      res.json(ok({ nodes: result.nodes }, llmRaw));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/layer/:depth/leaf/confirm", async (req, res, next) => {
    try {
      const depth = parseDepth(req.params.depth);
      if (depth === null) {
        res.status(400).json({ ok: false, error: "Depth must be a non-negative integer." });
        return;
      }

      const rawOverrides = req.body?.overrides;
      if (rawOverrides !== undefined) {
        if (typeof rawOverrides !== "object" || rawOverrides === null || Array.isArray(rawOverrides)) {
          res.status(400).json({ ok: false, error: "overrides must be an object." });
          return;
        }

        const values = Object.values(rawOverrides as Record<string, unknown>);
        const invalid = values.some((value) => value !== "leaf" && value !== "decompose_further");
        if (invalid) {
          res.status(400).json({ ok: false, error: 'Each override must be "leaf" or "decompose_further".' });
          return;
        }
      }

      const result = await confirmLeafNodes(
        depth,
        rawOverrides as Record<string, "leaf" | "decompose_further"> | undefined
      );
      res.json(ok({ nodes: result.nodes }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/phase2/exit-check", async (_req, res, next) => {
    try {
      const result = await getExitCheckStatus();
      res.json(ok({ complete: result.complete, decompose_further_ids: result.decompose_further_ids }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/lock", async (_req, res, next) => {
    try {
      const result = await lockPhase2();
      res.json(ok({ locked: result.locked }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/diagnose/:nodeId", async (req, res, next) => {
    try {
      const nodeId = req.params.nodeId;
      if (!nodeId) {
        res.status(400).json({ ok: false, error: "Node ID is required." });
        return;
      }

      const rawStart = getLLMRawLogLength();
      const result = await diagnoseNode(nodeId);
      const llmRaw = getLLMRawSince(rawStart)[0] ?? null;
      res.json(ok({ node_id: nodeId, ...result }, llmRaw));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/diagnose/:nodeId/confirm", async (req, res, next) => {
    try {
      const nodeId = req.params.nodeId;
      if (!nodeId) {
        res.status(400).json({ ok: false, error: "Node ID is required." });
        return;
      }

      const result = await confirmDiagnosis(nodeId, req.body ?? undefined);
      res.json(ok({ node_id: nodeId, ...result }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/diagnose/:nodeId/rewrite", async (req, res, next) => {
    try {
      const nodeId = req.params.nodeId;
      if (!nodeId) {
        res.status(400).json({ ok: false, error: "Node ID is required." });
        return;
      }
      const rawStart = getLLMRawLogLength();
      const result = await rewriteNode(nodeId);
      const llmRaw = getLLMRawSince(rawStart)[0] ?? null;
      res.json(ok({ node_id: nodeId, ...result }, llmRaw));
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/phase2/layer/:depth/node/:nodeId", async (req, res, next) => {
    try {
      const nodeId = req.params.nodeId;
      if (!nodeId) {
        res.status(400).json({ ok: false, error: "Node ID is required." });
        return;
      }

      const { intent, outputs, inputs } = req.body ?? {};

      if (!intent && !inputs && !outputs) {
        res.status(400).json({ ok: false, error: "At least one of intent, inputs, or outputs must be provided." });
        return;
      }

      const result = await editNode(nodeId, { intent, inputs, outputs });
      res.json(ok({ ...result }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/traverse/upward", async (req, res, next) => {
    try {
      const originNodes = req.body?.origin_nodes;
      if (
        !Array.isArray(originNodes) ||
        originNodes.length === 0 ||
        !originNodes.every((id: unknown) => typeof id === "string")
      ) {
        res.status(400).json({ ok: false, error: "origin_nodes must be a non-empty array of strings." });
        return;
      }

      const result = await traverseUpward(originNodes);
      res.json(ok({ invalidated: result.invalidated }));
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
      const parsed = events.map((e) => {
        try {
          return { ...e, payload: typeof e.payload === "string" ? JSON.parse(e.payload) : e.payload };
        } catch {
          return e;
        }
      });
      res.json(ok({ timeline: parsed }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/state/node/:nodeId/history", async (req, res, next) => {
    try {
      const history = await getEventHistory(req.params.nodeId);
      const parsed = history.map((e) => {
        try {
          return { ...e, payload: typeof e.payload === "string" ? JSON.parse(e.payload) : e.payload };
        } catch {
          return e;
        }
      });
      res.json(ok({ node_id: req.params.nodeId, history: parsed }));
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

      const definition = await getLayerCriteriaDocByDepth(depth);
      const nodes = await getNodesByDepth(depth);

      res.json(
        ok({
          depth,
          definition_locked: Boolean(definition?.locked),
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
    res.sendFile(path.join(clientDistDir, "index.html"));
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
