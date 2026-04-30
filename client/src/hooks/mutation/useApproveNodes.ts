import { useApiMutation } from "@/hooks/mutation/_shared";

export function useApproveNodes() {
  return useApiMutation<{ depth: number }>({
    path: (vars) => `/phase2/layer/${vars.depth}/nodes/approve`,
    invalidate: [["layer-nodes"], ["timeline"], ["layer-status"], ["layer-edges"]]
  });
}
