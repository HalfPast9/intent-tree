import type { DisplayState, EventRecord, NodeView } from "@/api/types";

export function deriveDisplayState(node: NodeView, history: EventRecord[] | undefined): DisplayState {
  if (node.state === "locked") return "locked";
  if (node.state === "invalidated") return "invalidated";

  const events = history ?? [];
  const hasProposed = events.some((e) => e.type === "node_proposed");

  const latestValidation = events
    .filter((e) => e.type === "node_validation_passed" || e.type === "node_validation_failed")
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

  if (!hasProposed) return "pending";
  if (!latestValidation) return "proposed";
  return latestValidation.type === "node_validation_passed" ? "passed" : "failed";
}
