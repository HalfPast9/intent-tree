import { useApiMutation } from "@/hooks/mutation/_shared";

export function useConfirmDiagnosis() {
  return useApiMutation<{ nodeId: string; body?: Record<string, unknown> }>({
    path: (vars) => `/phase2/diagnose/${vars.nodeId}/confirm`,
    body: (vars) => vars.body ?? {},
    invalidate: [["timeline"], ["node-history"], ["layer-nodes"], ["layer-status"]]
  });
}
