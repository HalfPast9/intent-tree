import express from "express";
import path from "node:path";

import { LLMResponseParseError } from "../llm/client.js";
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
  getOrCreateLayerCriteria,
  getOrCreateLayerNodes,
  getPhase2Snapshot,
  getOrCreateProposedStack
} from "../phase2/service.js";

const publicDir = path.resolve(process.cwd(), "public");

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.static(publicDir));

  app.get("/api/phase1/spec", async (_req, res, next) => {
    try {
      const spec = await getOrCreatePhase1Spec();
      res.json({ spec });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase1/message", async (req, res, next) => {
    try {
      const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";

      if (!message) {
        res.status(400).json({ error: "Message is required." });
        return;
      }

      const result = await processUserMessage(message);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase1/conflict-check", async (_req, res, next) => {
    try {
      const { spec, result } = await runConflictCheck();
      res.json({ spec, ...result });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase1/lock", async (_req, res, next) => {
    try {
      const spec = await lockPhase1();
      res.json({ success: true, spec });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/phase2/stack", async (_req, res, next) => {
    try {
      const { session } = await getOrCreateProposedStack();
      const snapshot = await getPhase2Snapshot(Number(session.current_depth ?? 0));
      res.json({
        session: snapshot.session,
        stack: snapshot.stack,
        stack_evolution_proposal: snapshot.stack_evolution_proposal
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/stack/evolution/approve", async (req, res, next) => {
    try {
      const depth = Number.isInteger(req.body?.depth) ? Number(req.body.depth) : 0;
      const proposedStack = Array.isArray(req.body?.proposed_stack) ? req.body.proposed_stack : undefined;
      const result = await approveStackEvolution({
        depth,
        proposed_stack: proposedStack
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/stack/approve", async (req, res, next) => {
    try {
      const layers = Array.isArray(req.body?.layers) ? req.body.layers : undefined;
      const result = await approveStack({ layers });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/phase2/layer/:depth/criteria", async (req, res, next) => {
    try {
      const depth = Number(req.params.depth);

      if (!Number.isInteger(depth) || depth < 0) {
        res.status(400).json({ error: "Depth must be a non-negative integer." });
        return;
      }

      const criteria = await getOrCreateLayerCriteria(depth);
      res.json({ criteria });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/layer/:depth/criteria/approve", async (req, res, next) => {
    try {
      const depth = Number(req.params.depth);

      if (!Number.isInteger(depth) || depth < 0) {
        res.status(400).json({ error: "Depth must be a non-negative integer." });
        return;
      }

      const criteria = await approveLayerCriteria(depth, req.body ?? undefined);
      res.json({ criteria });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/phase2/layer/:depth/nodes", async (req, res, next) => {
    try {
      const depth = Number(req.params.depth);

      if (!Number.isInteger(depth) || depth < 0) {
        res.status(400).json({ error: "Depth must be a non-negative integer." });
        return;
      }

      const nodes = await getOrCreateLayerNodes(depth);
      res.json({ nodes });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/phase2/layer/:depth/nodes/approve", async (req, res, next) => {
    try {
      const depth = Number(req.params.depth);

      if (!Number.isInteger(depth) || depth < 0) {
        res.status(400).json({ error: "Depth must be a non-negative integer." });
        return;
      }

      const result = await approveLayerNodes(depth);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("*", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof LLMResponseParseError) {
      res.status(502).json({ error: error.message, raw: error.raw });
      return;
    }

    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.status(500).json({ error: "Unknown server error" });
  });

  return app;
}
