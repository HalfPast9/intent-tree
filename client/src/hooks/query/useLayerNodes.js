import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
export function useLayerNodes(depth, poll) {
    return useQuery({
        queryKey: ["layer-nodes", depth],
        queryFn: () => apiFetch(`/phase2/layer/${depth}/nodes`),
        enabled: depth !== null,
        refetchInterval: poll ? 3000 : false
    });
}
