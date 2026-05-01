import { useEffect, useMemo, useRef } from "react";
import { useLayerDefinition } from "@/hooks/query/useLayerDefinition";
import { useLayerNodes } from "@/hooks/query/useLayerNodes";
import { useLayerStatus } from "@/hooks/query/useLayerStatus";
import { useTimeline } from "@/hooks/query/useTimeline";
import { useLockLayer } from "@/hooks/mutation/useLockLayer";

export type StepName =
  | "idle"
  | "layer definition"
  | "node proposals"
  | "validation"
  | "edge validation"
  | "collective check"
  | "syntax check"
  | "leaf determination"
  | "locked"
  | "phase2 complete";

export function useCurrentStep(sessionId: string | null, depth: number | null) {
  const defQ = useLayerDefinition(depth);
  const nodesQ = useLayerNodes(depth, false);
  const statusQ = useLayerStatus(depth);
  const timelineQ = useTimeline(depth !== null);
  const { mutate: lockLayerMutate, isPending: isAutoLocking } = useLockLayer();
  const lockFired = useRef(false);

  // Reset guard when session or depth changes (including session resets that bring depth to 0)
  const sessionKey = `${sessionId ?? "none"}-${depth ?? -1}`;
  useEffect(() => {
    lockFired.current = false;
  }, [sessionKey]);

  const isDeriving = defQ.isLoading || nodesQ.isLoading || statusQ.isLoading || timelineQ.isLoading;

  const step = useMemo<StepName | null>(() => {
    if (isDeriving || depth === null) return null;

    const definition = defQ.data?.definition;
    const nodes = nodesQ.data?.nodes ?? [];
    const events = timelineQ.data?.timeline ?? [];

    // Exclude invalidated nodes from step derivation
    const activeNodes = nodes.filter((n) => n.state !== "invalidated");

    // Layer events: filter by depth in payload
    const layerEvents = events.filter((e) => (e.payload?.depth as number | undefined) === depth);

    // Rules 1–2: layer definition
    if (!definition || !definition.locked) return "layer definition";

    // Rule 3: no nodes yet (or all invalidated after traversal)
    if (activeNodes.length === 0) return "node proposals";

    // Rules 4–5: individual validation — track most recent validation event per node
    const latestVal = new Map<string, string>();
    for (const e of events) {
      if (e.type === "node_validation_passed" || e.type === "node_validation_failed") {
        for (const id of e.node_ids ?? []) {
          latestVal.set(id, e.type);
        }
      }
    }

    const allValidated = activeNodes.every((n) => latestVal.has(n.id));
    if (!allValidated) return "validation";

    const anyFailed = activeNodes.some((n) => latestVal.get(n.id) === "node_validation_failed");
    if (anyFailed) return "validation";

    // Staleness detection: layer-level pass events must be more recent than the last
    // node-change event, otherwise the check needs to re-run against the new state.
    const activeNodeIds = new Set(activeNodes.map((n) => n.id));
    const nodeChangeTypes = new Set([
      "node_proposed", "node_checklist_approved", "node_rewritten",
      "node_claimed", "node_claim_rejected"
    ]);
    const latestNodeChangeTs = events
      .filter((e) => nodeChangeTypes.has(e.type) && (
        (e.payload?.depth as number | undefined) === depth ||
        (e.node_ids ?? []).some((id: string) => activeNodeIds.has(id))
      ))
      .reduce((max, e) => {
        const t = new Date(e.timestamp as string).getTime();
        return t > max ? t : max;
      }, 0);

    const isFreshPass = (eventType: string): boolean => {
      const passEvents = layerEvents.filter((e) => e.type === eventType);
      if (passEvents.length === 0) return false;
      const latest = passEvents.reduce((best, e) => {
        const t = new Date(e.timestamp as string).getTime();
        return t > best ? t : best;
      }, 0);
      return latest > latestNodeChangeTs;
    };

    // Rule 6: edge validation
    if (!isFreshPass("edge_validation_passed")) return "edge validation";

    // Rule 7: collective check
    if (!isFreshPass("collective_vertical_passed")) return "collective check";

    // Rule 8: syntax check
    if (!isFreshPass("syntax_check_passed")) return "syntax check";

    // Rule 8: layer lock (auto-triggered via useEffect)
    const allLocked = statusQ.data?.nodes.every((n) => n.state === "locked") ?? false;
    if (!allLocked) return "idle";

    // Rule 9: leaf determination
    if (!layerEvents.some((e) => e.type === "node_leaf_confirmed")) return "leaf determination";

    // Rule 10: layer complete
    return "locked";
  }, [depth, isDeriving, defQ.data, nodesQ.data, timelineQ.data, statusQ.data]);

  // Rule 8 auto-lock: fire once when syntax passed but layer not yet locked
  useEffect(() => {
    if (step !== "idle" || lockFired.current || isAutoLocking || depth === null) return;
    lockFired.current = true;
    lockLayerMutate({ depth });
  }, [step, depth, isAutoLocking, lockLayerMutate]);

  return {
    step,
    status: isDeriving ? ("deriving" as const) : ("ready" as const),
    layerDefinition: defQ,
    layerNodes: nodesQ,
    layerStatus: statusQ,
    timeline: timelineQ,
    isAutoLocking
  };
}
