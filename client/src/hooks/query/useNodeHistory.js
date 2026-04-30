import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
export function useNodeHistory(nodeId, enabled = true) {
    return useQuery({
        queryKey: ["node-history", nodeId],
        queryFn: () => apiFetch(`/state/node/${nodeId}/history`),
        enabled: enabled && Boolean(nodeId)
    });
}
