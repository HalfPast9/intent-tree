import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
export function useLayerEdges(depth) {
    return useQuery({
        queryKey: ["layer-edges", depth],
        queryFn: () => apiFetch(`/phase2/layer/${depth}/edges`),
        enabled: depth !== null
    });
}
