import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  DeleteInferenceHookResponseBody,
  GetInferenceHookResponseBody,
  UpsertInferenceHookBody,
  UpsertInferenceHookResponseBody,
} from "@app/types/inference_hook";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";
import type { Fetcher } from "swr";

function inferenceHooksUrl(owner: LightWorkspaceType) {
  return `/api/w/${owner.sId}/inference_hooks`;
}

export function useInferenceHook(
  owner: LightWorkspaceType,
  { disabled }: { disabled?: boolean } = {}
) {
  const { fetcher } = useFetcher();
  const inferenceHookFetcher: Fetcher<GetInferenceHookResponseBody> = fetcher;

  const { data, error, mutate, isValidating } = useSWRWithDefaults(
    inferenceHooksUrl(owner),
    inferenceHookFetcher,
    { disabled }
  );

  return {
    inferenceHook: data?.inferenceHook ?? null,
    isInferenceHookLoading: !error && !data && !disabled,
    isInferenceHookError: error,
    isInferenceHookValidating: isValidating,
    mutateInferenceHook: mutate,
  };
}

export function useUpsertInferenceHook({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();
  const { mutateInferenceHook } = useInferenceHook(owner);

  const upsertInferenceHook = useCallback(
    async (body: UpsertInferenceHookBody): Promise<boolean> => {
      const res = await clientFetch(inferenceHooksUrl(owner), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        sendNotification({
          type: "error",
          title: "Failed to save inference hook",
          description:
            err?.error?.message ?? "Could not save inference hook settings.",
        });
        return false;
      }

      const data: UpsertInferenceHookResponseBody = await res.json();
      await mutateInferenceHook(
        { inferenceHook: data.inferenceHook },
        { revalidate: false }
      );
      sendNotification({
        type: "success",
        title: "Inference hook saved",
        description: "The evaluate hook will run on agent model steps.",
      });
      return true;
    },
    [mutateInferenceHook, owner, sendNotification]
  );

  return { upsertInferenceHook };
}

export function useDeleteInferenceHook({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();
  const { mutateInferenceHook } = useInferenceHook(owner);

  const deleteInferenceHook = useCallback(async (): Promise<boolean> => {
    const res = await clientFetch(inferenceHooksUrl(owner), {
      method: "DELETE",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      sendNotification({
        type: "error",
        title: "Failed to remove inference hook",
        description:
          err?.error?.message ?? "Could not remove inference hook settings.",
      });
      return false;
    }

    const data: DeleteInferenceHookResponseBody = await res.json();
    if (data.success) {
      await mutateInferenceHook({ inferenceHook: null }, { revalidate: false });
      sendNotification({
        type: "success",
        title: "Inference hook removed",
        description: "No evaluate hook is configured for this workspace.",
      });
    }
    return data.success;
  }, [mutateInferenceHook, owner, sendNotification]);

  return { deleteInferenceHook };
}
