import { useApiMutation } from "@/hooks/mutation/_shared";
export function useConfirmLeaf() {
    return useApiMutation({
        path: (vars) => `/phase2/layer/${vars.depth}/leaf/confirm`,
        body: (vars) => vars.body ?? {},
        invalidate: [["layer-nodes"], ["timeline"], ["layer-status"], ["session"]]
    });
}
