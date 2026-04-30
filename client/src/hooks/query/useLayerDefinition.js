import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
export function useLayerDefinition(depth) {
    return useQuery({
        queryKey: ["layer-def", depth],
        queryFn: () => apiFetch(`/phase2/layer/${depth}/definition`),
        enabled: depth !== null
    });
}
