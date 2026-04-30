import { useApiMutation } from "@/hooks/mutation/_shared";

export function useConfirmLeaf() {
  return useApiMutation<{ depth: number; body?: { overrides?: Record<string, "leaf" | "decompose_further"> } }>({
    path: (vars) => `/phase2/layer/${vars.depth}/leaf/confirm`,
    body: (vars) => vars.body ?? {},
    invalidate: [["layer-nodes"], ["timeline"], ["layer-status"], ["session"]]
  });
}
