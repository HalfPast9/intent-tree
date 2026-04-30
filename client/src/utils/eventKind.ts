export type EventKind = "info" | "ok" | "warn" | "error";

export function mapEventKind(type: string): EventKind {
  if (
    type.endsWith("_passed") ||
    type.endsWith("_locked") ||
    type.endsWith("_approved") ||
    type.endsWith("_confirmed") ||
    type === "phase1_locked" ||
    type === "phase2_locked"
  ) {
    return "ok";
  }

  if (
    type === "conflict_detected" ||
    type.endsWith("_overridden") ||
    type === "node_claimed" ||
    type === "collective_vertical_failed"
  ) {
    return "warn";
  }

  if (
    type.endsWith("_failed") ||
    type === "node_invalidated" ||
    type === "edge_invalidated" ||
    type === "node_claim_rejected" ||
    type === "upward_traversal_triggered"
  ) {
    return "error";
  }

  return "info";
}
