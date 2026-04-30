import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
export function useSpec() {
    return useQuery({
        queryKey: ["spec"],
        queryFn: () => apiFetch("/phase1/spec"),
        refetchOnWindowFocus: true
    });
}
