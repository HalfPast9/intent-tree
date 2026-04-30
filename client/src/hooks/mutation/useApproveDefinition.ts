import { useApiMutation } from "@/hooks/mutation/_shared";

export function useApproveDefinition() {
  return useApiMutation<{ depth: number; body?: Record<string, unknown> }>({
    path: (vars) => `/phase2/layer/${vars.depth}/definition/approve`,
    body: (vars) => vars.body ?? {},
    invalidate: [["layer-def"], ["timeline"], ["layer-status"], ["stack"]]
  });
}
