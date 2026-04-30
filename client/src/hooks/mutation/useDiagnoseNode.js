import { useApiMutation } from "@/hooks/mutation/_shared";
export function useDiagnoseNode() {
    return useApiMutation({
        path: (vars) => `/phase2/diagnose/${vars.nodeId}`,
        invalidate: [["timeline"], ["node-history"]]
    });
}
