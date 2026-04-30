import { useApiMutation } from "@/hooks/mutation/_shared";
export function useGenerateDefinition() {
    return useApiMutation({
        path: (vars) => `/phase2/layer/${vars.depth}/definition/generate`,
        invalidate: [["layer-def"], ["timeline"], ["layer-status"], ["stack"]]
    });
}
