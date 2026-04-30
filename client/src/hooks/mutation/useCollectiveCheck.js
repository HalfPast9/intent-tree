import { useApiMutation } from "@/hooks/mutation/_shared";
export function useCollectiveCheck() {
    return useApiMutation({
        path: (vars) => `/phase2/layer/${vars.depth}/validate/collective`,
        invalidate: [["timeline"], ["layer-status"]]
    });
}
