import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import type { EventRecord } from "@/api/types";

export function useTimeline(enabled = true) {
  return useQuery({
    queryKey: ["timeline"],
    queryFn: () => apiFetch<{ timeline: EventRecord[] }>("/state/timeline"),
    enabled,
    refetchInterval: 3000
  });
}
