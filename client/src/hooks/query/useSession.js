import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
export function useSession() {
    return useQuery({
        queryKey: ["session"],
        queryFn: () => apiFetch("/state/session"),
        refetchInterval: 5000
    });
}
