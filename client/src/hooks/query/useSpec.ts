import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import type { ConflictItem, ProblemSpec } from "@/api/types";

type SpecPayload = { spec: ProblemSpec; clean?: boolean; conflicts?: ConflictItem[] };

export function useSpec() {
  return useQuery({
    queryKey: ["spec"],
    queryFn: () => apiFetch<SpecPayload>("/phase1/spec"),
    refetchOnWindowFocus: true
  });
}
