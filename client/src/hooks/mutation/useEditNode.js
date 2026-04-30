import { useApiMutation } from "@/hooks/mutation/_shared";
export function useEditNode() {
    return useApiMutation({
        path: (vars) => `/phase2/layer/${vars.depth}/node/${vars.nodeId}`,
        method: "PATCH",
        body: (vars) => vars.body,
        invalidate: [["layer-nodes"], ["timeline"], ["node-history"], ["layer-status"]]
    });
}
