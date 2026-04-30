import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import type { EventRecord } from "@/api/types";

export function useNodeHistory(nodeId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["node-history", nodeId],
    queryFn: () => apiFetch<{ node_id: string; history: EventRecord[] }>(`/state/node/${nodeId}/history`),
    enabled: enabled && Boolean(nodeId)
  });
}
