import { useApiMutation } from "@/hooks/mutation/_shared";
export function useLockPhase1() {
    return useApiMutation({
        path: () => "/phase1/lock",
        invalidate: [["session"], ["spec"], ["stack"]]
    });
}
