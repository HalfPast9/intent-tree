import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
export function useLayerStatus(depth) {
    return useQuery({
        queryKey: ["layer-status", depth],
        queryFn: () => apiFetch(`/state/layer/${depth}/status`),
        enabled: depth !== null
    });
}
