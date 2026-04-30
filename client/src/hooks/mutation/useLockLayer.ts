import { useApiMutation } from "@/hooks/mutation/_shared";

export function useLockLayer() {
  return useApiMutation<{ depth: number }>({
    path: (vars) => `/phase2/layer/${vars.depth}/lock`,
    invalidate: [["session"], ["layer-status"], ["layer-nodes"], ["timeline"], ["layer-edges"], ["stack"]]
  });
}
