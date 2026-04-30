import { useApiMutation } from "@/hooks/mutation/_shared";
export function useDetermineLeaf() {
    return useApiMutation({
        path: (vars) => `/phase2/layer/${vars.depth}/leaf/determine`,
        invalidate: [["layer-nodes"], ["timeline"]]
    });
}
