import { useApiMutation } from "@/hooks/mutation/_shared";
export function useEdgeValidation() {
    return useApiMutation({
        path: (vars) => `/phase2/layer/${vars.depth}/validate/edges`,
        invalidate: [["timeline"], ["layer-status"], ["layer-edges"]]
    });
}
