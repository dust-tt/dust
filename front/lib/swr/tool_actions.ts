import { useSendNotification } from "@app/hooks/useNotification";
import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import type {
  ResolveAuthenticationKind,
  ResolveAuthenticationOutcome,
} from "@app/lib/api/assistant/conversation/resolve_authentication";
import { useFetcher } from "@app/lib/swr/swr";
import type { MCPActionValidationRequest } from "@app/types/assistant/conversation";
import { isAPIErrorResponse } from "@app/types/error";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";

const ROUTE_FOR_KIND: Record<ResolveAuthenticationKind, string> = {
  authentication: "resolve-authentication",
  file_authorization: "resolve-file-authorization",
};

const LABEL_FOR_KIND: Record<ResolveAuthenticationKind, string> = {
  authentication: "authentication",
  file_authorization: "file authorization",
};

function isAlreadyResolvedError(error: unknown): boolean {
  return isAPIErrorResponse(error) && error.error.type === "action_not_blocked";
}

interface UseResolveAuthenticationParams {
  owner: LightWorkspaceType;
  kind?: ResolveAuthenticationKind;
}

export function useResolveAuthentication({
  owner,
  kind = "authentication",
}: UseResolveAuthenticationParams) {
  const sendNotification = useSendNotification();
  const { fetcher } = useFetcher();
  const [isResolving, setIsResolving] = useState(false);

  const resolveAuthentication = useCallback(
    async ({
      conversationId,
      messageId,
      actionId,
      outcome,
    }: {
      conversationId: string;
      messageId: string;
      actionId: string;
      outcome: ResolveAuthenticationOutcome;
    }) => {
      setIsResolving(true);

      try {
        // The backend resumes both the conversation that contains the action and any blocked
        // ancestor conversations.
        await fetcher(
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}/${ROUTE_FOR_KIND[kind]}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              actionId,
              outcome,
              resumeAncestorConversations: true,
            }),
          }
        );

        return { success: true };
      } catch (error) {
        if (isAlreadyResolvedError(error)) {
          return { success: true };
        }

        sendNotification({
          type: "error",
          title: `Failed to resolve ${LABEL_FOR_KIND[kind]}`,
          description: `Failed to resume the ${LABEL_FOR_KIND[kind]} tool. Please try again.`,
        });
        return { success: false };
      } finally {
        setIsResolving(false);
      }
    },
    [owner.sId, sendNotification, fetcher, kind]
  );

  return { resolveAuthentication, isResolving };
}

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
      } catch (error) {
        if (isAlreadyResolvedError(error)) {
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

interface UseValidateActionParams {
  owner: LightWorkspaceType;
  onError: (errorMessage: string) => void;
}

export function useValidateAction({ owner, onError }: UseValidateActionParams) {
  const { fetcher } = useFetcher();
  const [isValidating, setIsValidating] = useState(false);

  const validateAction = useCallback(
    async ({
      validationRequest,
      approved,
    }: {
      validationRequest: MCPActionValidationRequest;
      approved: MCPValidationOutputType;
    }) => {
      setIsValidating(true);

      try {
        // The backend resumes both the conversation that contains the action and any blocked
        // ancestor conversations.
        await fetcher(
          `/api/w/${owner.sId}/assistant/conversations/${validationRequest.conversationId}/messages/${validationRequest.messageId}/validate-action`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              actionId: validationRequest.actionId,
              approved,
              resumeAncestorConversations: true,
            }),
          }
        );

        return { success: true };
      } catch (error) {
        if (isAlreadyResolvedError(error)) {
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
      } catch (error) {
        if (isAlreadyResolvedError(error)) {
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
