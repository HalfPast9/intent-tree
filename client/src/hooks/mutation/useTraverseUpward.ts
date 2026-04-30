import { useApiMutation } from "@/hooks/mutation/_shared";

export function useTraverseUpward() {
  return useApiMutation<{ origin_nodes: string[] }>({
    path: () => "/phase2/traverse/upward",
    body: (vars) => ({ origin_nodes: vars.origin_nodes }),
    invalidate: [["layer-nodes"], ["timeline"], ["layer-status"], ["layer-edges"], ["session"]]
  });
}
