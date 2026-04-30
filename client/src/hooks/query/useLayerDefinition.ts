import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import type { LayerCriteriaDoc } from "@/api/types";

export function useLayerDefinition(depth: number | null) {
  return useQuery({
    queryKey: ["layer-def", depth],
    queryFn: () => apiFetch<{ definition: LayerCriteriaDoc | null }>(`/phase2/layer/${depth}/definition`),
    enabled: depth !== null
  });
}
