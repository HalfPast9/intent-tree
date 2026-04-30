import type { DiagnosisResult } from "@/api/types";
import { useApiMutation } from "@/hooks/mutation/_shared";

export function useDiagnoseNode() {
  return useApiMutation<{ nodeId: string }, DiagnosisResult>({
    path: (vars) => `/phase2/diagnose/${vars.nodeId}`,
    invalidate: [["timeline"], ["node-history"]]
  });
}
