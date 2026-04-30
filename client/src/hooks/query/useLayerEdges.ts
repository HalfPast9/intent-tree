import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import type { ArchEdge } from "@/api/types";

export function useLayerEdges(depth: number | null) {
  return useQuery({
    queryKey: ["layer-edges", depth],
    queryFn: () => apiFetch<{ edges: ArchEdge[] }>(`/phase2/layer/${depth}/edges`),
    enabled: depth !== null
  });
}
