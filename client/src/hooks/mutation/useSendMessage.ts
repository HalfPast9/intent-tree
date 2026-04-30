import { useApiMutation } from "@/hooks/mutation/_shared";

export function useSendMessage() {
  return useApiMutation<{ message: string }>({
    path: () => "/phase1/message",
    body: (vars) => ({ message: vars.message }),
    invalidate: [["spec"], ["session"]]
  });
}
