import { useApiMutation } from "@/hooks/mutation/_shared";
export function useSendMessage() {
    return useApiMutation({
        path: () => "/phase1/message",
        body: (vars) => ({ message: vars.message }),
        invalidate: [["spec"], ["session"]]
    });
}
