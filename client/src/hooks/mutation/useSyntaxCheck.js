import { useApiMutation } from "@/hooks/mutation/_shared";
export function useSyntaxCheck() {
    return useApiMutation({
        path: (vars) => `/phase2/layer/${vars.depth}/validate/syntax`,
        invalidate: [["timeline"], ["layer-status"]]
    });
}
