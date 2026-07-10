import { useSendNotification } from "@app/hooks/useNotification";
import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import { useFetcher } from "@app/lib/swr/swr";
import { isAPIErrorResponse } from "@app/types/error";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";

type ResolveAuthenticationOutcome = "completed" | "denied";

interface UseResolveSandboxFunctionAuthenticationParams {
  owner: LightWorkspaceType;
}

export function useResolveSandboxFunctionAuthentication({
  owner,
}: UseResolveSandboxFunctionAuthenticationParams) {
  const sendNotification = useSendNotification();
  const { fetcher } = useFetcher();
  const [isResolving, setIsResolving] = useState(false);

  const resolveAuthentication = useCallback(
    async ({
      sandboxFunctionId,
      invocationId,
      actionId,
      outcome,
    }: {
      sandboxFunctionId: string;
      invocationId: string;
      actionId: string;
      outcome: ResolveAuthenticationOutcome;
    }) => {
      setIsResolving(true);

      try {
        await fetcher(
          `/api/w/${owner.sId}/sandbox-functions/${sandboxFunctionId}/invocations/${invocationId}/actions/${actionId}/resolve-authentication`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ outcome }),
          }
        );

        return { success: true };
      } catch (e) {
        // If the action is not blocked anymore, the resolution already happened (e.g. from
        // another client): consider it successful.
        if (isAPIErrorResponse(e) && e.error.type === "action_not_blocked") {
          return { success: true };
        }

        sendNotification({
          type: "error",
          title: "Failed to resolve authentication",
          description:
            "Failed to resume the authentication tool. Please try again.",
        });
        return { success: false };
      } finally {
        setIsResolving(false);
      }
    },
    [owner.sId, sendNotification, fetcher]
  );

  return { resolveAuthentication, isResolving };
}

interface UseValidateSandboxFunctionActionParams {
  owner: LightWorkspaceType;
  onError: (errorMessage: string) => void;
}

export function useValidateSandboxFunctionAction({
  owner,
  onError,
}: UseValidateSandboxFunctionActionParams) {
  const { fetcher } = useFetcher();
  const [isValidating, setIsValidating] = useState(false);

  const validateAction = useCallback(
    async ({
      sandboxFunctionId,
      invocationId,
      actionId,
      approved,
    }: {
      sandboxFunctionId: string;
      invocationId: string;
      actionId: string;
      approved: MCPValidationOutputType;
    }) => {
      setIsValidating(true);

      try {
        await fetcher(
          `/api/w/${owner.sId}/sandbox-functions/${sandboxFunctionId}/invocations/${invocationId}/actions/${actionId}/validate`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ approved }),
          }
        );

        return { success: true };
      } catch (e) {
        // If the action is not blocked anymore, we consider the validation already successful.
        // This can happen if multiple clients validate the same action.
        if (isAPIErrorResponse(e) && e.error.type === "action_not_blocked") {
          return { success: true };
        }
        onError("Failed to assess action approval. Please try again.");
        return { success: false };
      } finally {
        setIsValidating(false);
      }
    },
    [owner.sId, onError, fetcher]
  );

  return { validateAction, isValidating };
}
