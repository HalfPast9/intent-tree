import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
export function useApiMutation(options) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (vars) => apiFetch(options.path(vars), {
            method: options.method ?? "POST",
            body: options.body ? JSON.stringify(options.body(vars)) : undefined
        }),
        onSuccess: async () => {
            await Promise.all((options.invalidate ?? []).map((key) => queryClient.invalidateQueries({ queryKey: key })));
        }
    });
}
