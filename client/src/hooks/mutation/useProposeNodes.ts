import type { NodeView } from "@/api/types";
import { useApiMutation } from "@/hooks/mutation/_shared";

export function useProposeNodes() {
  return useApiMutation<{ depth: number }, { nodes: NodeView[] }>({
    path: (vars) => `/phase2/layer/${vars.depth}/nodes/propose`,
    invalidate: [["layer-nodes"], ["timeline"], ["layer-status"], ["layer-edges"]]
  });
}
