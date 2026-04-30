import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import type { LayerStatus } from "@/api/types";

export function useLayerStatus(depth: number | null) {
  return useQuery({
    queryKey: ["layer-status", depth],
    queryFn: () => apiFetch<LayerStatus>(`/state/layer/${depth}/status`),
    enabled: depth !== null
  });
}
