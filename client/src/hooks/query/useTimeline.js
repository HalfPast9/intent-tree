import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
export function useTimeline(enabled = true) {
    return useQuery({
        queryKey: ["timeline"],
        queryFn: () => apiFetch("/state/timeline"),
        enabled,
        refetchInterval: 3000
    });
}
