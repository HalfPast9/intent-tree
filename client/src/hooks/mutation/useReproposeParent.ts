import { useApiMutation } from "@/hooks/mutation/_shared";

export function useReproposeParent() {
  return useApiMutation<{ depth: number; parentId: string }>({
    path: (vars) => `/phase2/layer/${vars.depth}/nodes/repropose/parent/${vars.parentId}`,
    invalidate: [["layer-nodes"], ["timeline"], ["layer-status"], ["layer-edges"]]
  });
}
