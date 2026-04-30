import { useApiMutation } from "@/hooks/mutation/_shared";

export function useConflictCheck() {
  return useApiMutation<void>({
    path: () => "/phase1/conflict-check",
    invalidate: [["spec"]]
  });
}
