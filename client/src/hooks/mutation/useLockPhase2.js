import { useApiMutation } from "@/hooks/mutation/_shared";
export function useLockPhase2() {
    return useApiMutation({
        path: () => "/phase2/lock",
        invalidate: [["session"], ["timeline"], ["stack"]]
    });
}
