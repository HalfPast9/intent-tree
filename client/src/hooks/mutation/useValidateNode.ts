import { useApiMutation } from "@/hooks/mutation/_shared";

export function useValidateNode() {
  return useApiMutation<{ depth: number; nodeId: string }>({
    path: (vars) => `/phase2/layer/${vars.depth}/validate/node/${vars.nodeId}`,
    invalidate: [["layer-nodes"], ["timeline"], ["node-history"]]
  });
}
