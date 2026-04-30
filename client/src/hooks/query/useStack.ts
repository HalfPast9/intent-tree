import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import type { AbstractionStack, SessionRecord } from "@/api/types";

export function useStack() {
  return useQuery({
    queryKey: ["stack"],
    queryFn: () => apiFetch<{ session: SessionRecord | null; stack: AbstractionStack | null }>("/phase2/stack"),
    staleTime: Number.POSITIVE_INFINITY
  });
}
