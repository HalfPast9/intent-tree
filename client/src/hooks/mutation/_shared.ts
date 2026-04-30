import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";

type MutationOptions<TVars, TResult> = {
  path: (vars: TVars) => string;
  method?: "POST" | "PATCH";
  body?: (vars: TVars) => unknown;
  invalidate?: QueryKey[];
};

export function useApiMutation<TVars, TResult = Record<string, unknown>>(options: MutationOptions<TVars, TResult>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vars: TVars) =>
      apiFetch<TResult>(options.path(vars), {
        method: options.method ?? "POST",
        body: options.body ? JSON.stringify(options.body(vars)) : undefined
      }),
    onSuccess: async () => {
      await Promise.all((options.invalidate ?? []).map((key) => queryClient.invalidateQueries({ queryKey: key })));
    }
  });
}
