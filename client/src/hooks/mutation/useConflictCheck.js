import { useApiMutation } from "@/hooks/mutation/_shared";
export function useConflictCheck() {
    return useApiMutation({
        path: () => "/phase1/conflict-check",
        invalidate: [["spec"]]
    });
}
