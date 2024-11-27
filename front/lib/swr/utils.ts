import type { SWRMutationConfiguration } from "swr/mutation";

import { fetcherWithBody } from "@app/lib/swr/swr";

/**
 * Decorates the provided SWR mutation configuration with an invalidation step.
 * This ensures that the cache is invalidated after a successful mutation.
 *
 * @template TData - The type of the data returned by the mutation.
 * @template TError - The type of the error returned by the mutation. Defaults to `Error`.
 * @param {SWRMutationConfiguration<TData, TError, string> | undefined} options - The original SWR mutation configuration.
 * @param {() => Promise<void>} invalidateCacheEntries - A function that invalidates cache entries.
 * @returns {SWRMutationConfiguration<TData, TError, string>} - The decorated SWR mutation configuration.
 */
export function decorateWithInvalidation<TData, TError = Error>(
  options: SWRMutationConfiguration<TData, TError, string> | undefined,
  invalidateCacheEntries: () => Promise<void>
): SWRMutationConfiguration<TData, TError, string> {
  return options
    ? {
        ...options,
        onSuccess: async (data, key, config) => {
          await options.onSuccess?.(data, key, config);
          await invalidateCacheEntries();
        },
      }
    : {
        onSuccess: invalidateCacheEntries,
      };
}

/**
 * Shortcut for creating a mutation function that sends a PATCH/POST request.*
 **/
export function mutationFn<TArgs extends object>(method: "PATCH" | "POST") {
  return async function sendPatchRequest(
    url: string,
    { arg: payload }: { arg: TArgs }
  ) {
    // Extract onj from arg if simple object
    const res = await fetcherWithBody([url, payload, method]);
    return res;
  };
}
