import { useApiMutation } from "@/hooks/mutation/_shared";
export function useApproveRepropose() {
    return useApiMutation({
        path: (vars) => `/phase2/layer/${vars.depth}/nodes/repropose/approve`,
        invalidate: [["layer-nodes"], ["timeline"], ["layer-status"], ["layer-edges"]]
    });
}
