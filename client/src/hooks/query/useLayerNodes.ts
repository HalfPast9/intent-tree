import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import type { NodeView } from "@/api/types";

export function useLayerNodes(depth: number | null, poll: boolean) {
  return useQuery({
    queryKey: ["layer-nodes", depth],
    queryFn: () => apiFetch<{ nodes: NodeView[] }>(`/phase2/layer/${depth}/nodes`),
    enabled: depth !== null,
    refetchInterval: poll ? 3000 : false
  });
}
