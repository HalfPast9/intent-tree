import { useApiMutation } from "@/hooks/mutation/_shared";
export function useProposeNodes() {
    return useApiMutation({
        path: (vars) => `/phase2/layer/${vars.depth}/nodes/propose`,
        invalidate: [["layer-nodes"], ["timeline"], ["layer-status"], ["layer-edges"]]
    });
}
