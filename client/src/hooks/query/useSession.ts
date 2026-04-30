import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import type { SessionRecord } from "@/api/types";

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: () => apiFetch<{ session: SessionRecord | null }>("/state/session"),
    refetchInterval: 5000
  });
}
