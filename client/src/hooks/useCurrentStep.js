import { useEffect, useMemo, useRef } from "react";
import { useLayerDefinition } from "@/hooks/query/useLayerDefinition";
import { useLayerNodes } from "@/hooks/query/useLayerNodes";
import { useLayerStatus } from "@/hooks/query/useLayerStatus";
import { useTimeline } from "@/hooks/query/useTimeline";
import { useLockLayer } from "@/hooks/mutation/useLockLayer";
export function useCurrentStep(sessionId, depth) {
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
    const step = useMemo(() => {
        if (isDeriving || depth === null)
            return null;
        const definition = defQ.data?.definition;
        const nodes = nodesQ.data?.nodes ?? [];
        const events = timelineQ.data?.timeline ?? [];
        // Layer events: filter by depth in payload
        const layerEvents = events.filter((e) => e.payload?.depth === depth);
        // Rules 1–2: layer definition
        if (!definition || !definition.locked)
            return "layer definition";
        // Rule 3: no nodes yet
        if (nodes.length === 0)
            return "node proposals";
        // Rules 4–5: individual validation — track most recent validation event per node
        const latestVal = new Map();
        for (const e of events) {
            if (e.type === "node_validation_passed" || e.type === "node_validation_failed") {
                for (const id of e.node_ids ?? []) {
                    latestVal.set(id, e.type);
                }
            }
        }
        const allValidated = nodes.every((n) => latestVal.has(n.id));
        if (!allValidated)
            return "validation";
        const anyFailed = nodes.some((n) => latestVal.get(n.id) === "node_validation_failed");
        if (anyFailed)
            return "validation";
        // Rule 6: edge validation
        if (!layerEvents.some((e) => e.type === "edge_validation_passed"))
            return "edge validation";
        // Rule 7: collective check
        if (!layerEvents.some((e) => e.type === "collective_vertical_passed"))
            return "collective check";
        // Rule 7: syntax check
        if (!layerEvents.some((e) => e.type === "syntax_check_passed"))
            return "syntax check";
        // Rule 8: layer lock (auto-triggered via useEffect)
        const allLocked = statusQ.data?.nodes.every((n) => n.state === "locked") ?? false;
        if (!allLocked)
            return "idle";
        // Rule 9: leaf determination
        if (!layerEvents.some((e) => e.type === "node_leaf_confirmed"))
            return "leaf determination";
        // Rule 10: layer complete
        return "locked";
    }, [depth, isDeriving, defQ.data, nodesQ.data, timelineQ.data, statusQ.data]);
    // Rule 8 auto-lock: fire once when syntax passed but layer not yet locked
    useEffect(() => {
        if (step !== "idle" || lockFired.current || isAutoLocking || depth === null)
            return;
        lockFired.current = true;
        lockLayerMutate({ depth });
    }, [step, depth, isAutoLocking, lockLayerMutate]);
    return {
        step,
        status: isDeriving ? "deriving" : "ready",
        layerDefinition: defQ,
        layerNodes: nodesQ,
        layerStatus: statusQ,
        timeline: timelineQ,
        isAutoLocking
    };
}
