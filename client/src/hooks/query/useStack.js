import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
export function useStack() {
    return useQuery({
        queryKey: ["stack"],
        queryFn: () => apiFetch("/phase2/stack"),
        staleTime: Number.POSITIVE_INFINITY
    });
}
