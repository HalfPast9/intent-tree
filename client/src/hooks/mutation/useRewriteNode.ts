import { useApiMutation } from "@/hooks/mutation/_shared";

export function useRewriteNode() {
  return useApiMutation<{ nodeId: string }>({
    path: (vars) => `/phase2/diagnose/${vars.nodeId}/rewrite`,
    invalidate: [["timeline"], ["node-history"], ["layer-nodes"], ["layer-status"]]
  });
}
