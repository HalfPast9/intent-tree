import { useApiMutation } from "@/hooks/mutation/_shared";

export function useGenerateDefinition() {
  return useApiMutation<{ depth: number }>({
    path: (vars) => `/phase2/layer/${vars.depth}/definition/generate`,
    invalidate: [["layer-def"], ["timeline"], ["layer-status"], ["stack"]]
  });
}
