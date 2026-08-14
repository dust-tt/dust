import { useSendNotification } from "@app/hooks/useNotification";
import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import type {
  ResolveAuthenticationKind,
  ResolveAuthenticationOutcome,
} from "@app/lib/api/assistant/conversation/resolve_authentication";
import { useFetcher } from "@app/lib/swr/swr";
import { frameShareTokenHeader } from "@app/types/api/sandbox_functions";
import { isAPIErrorResponse } from "@app/types/error";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
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

type ToolActionContext =
  | {
      contextType: "agent_loop";
      conversationId: string;
      messageId: string;
    }
  | {
      contextType: "sandbox_function";
      sandboxFunctionId: string;
      invocationId: string;
    };

type ResolveAuthenticationRequest =
  | {
      contextType: "agent_loop";
      kind: ResolveAuthenticationKind;
      conversationId: string;
      messageId: string;
      actionId: string;
      outcome: ResolveAuthenticationOutcome;
    }
  | {
      contextType: "sandbox_function";
      sandboxFunctionId: string;
      invocationId: string;
      actionId: string;
      outcome: ResolveAuthenticationOutcome;
    };

type ValidateActionRequest = ToolActionContext & {
  actionId: string;
  approved: MCPValidationOutputType;
};

interface ToolActionMutationRequest {
  url: string;
  body: Record<string, unknown>;
}

function getResolveAuthenticationRequest(
  workspaceId: string,
  request: ResolveAuthenticationRequest
): ToolActionMutationRequest | null {
  switch (request.contextType) {
    case "agent_loop":
      return {
        url: `/api/w/${workspaceId}/assistant/conversations/${request.conversationId}/messages/${request.messageId}/${ROUTE_FOR_KIND[request.kind]}`,
        body: {
          actionId: request.actionId,
          outcome: request.outcome,
        },
      };
    case "sandbox_function":
      return {
        url: `/api/w/${workspaceId}/sandbox-functions/${request.sandboxFunctionId}/invocations/${request.invocationId}/actions/${request.actionId}/resolve-authentication`,
        body: { outcome: request.outcome },
      };
    default:
      assertNeverAndIgnore(request);
      return null;
  }
}

function getAuthenticationKindLabel(
  request: ResolveAuthenticationRequest
): string {
  switch (request.contextType) {
    case "agent_loop":
      return LABEL_FOR_KIND[request.kind];
    case "sandbox_function":
      return LABEL_FOR_KIND.authentication;
    default:
      assertNeverAndIgnore(request);
      return LABEL_FOR_KIND.authentication;
  }
}

function getValidateActionRequest(
  workspaceId: string,
  request: ValidateActionRequest
): ToolActionMutationRequest | null {
  switch (request.contextType) {
    case "agent_loop":
      return {
        url: `/api/w/${workspaceId}/assistant/conversations/${request.conversationId}/messages/${request.messageId}/validate-action`,
        body: {
          actionId: request.actionId,
          approved: request.approved,
        },
      };
    case "sandbox_function":
      return {
        url: `/api/w/${workspaceId}/sandbox-functions/${request.sandboxFunctionId}/invocations/${request.invocationId}/actions/${request.actionId}/validate-action`,
        body: { approved: request.approved },
      };
    default:
      assertNeverAndIgnore(request);
      return null;
  }
}

interface UseResolveAuthenticationParams {
  owner: LightWorkspaceType;
  /** Share token of the frame hosting the action, presented as an invocation capability. */
  frameShareToken?: string;
}

export function useResolveAuthentication({
  owner,
  frameShareToken,
}: UseResolveAuthenticationParams) {
  const sendNotification = useSendNotification();
  const { fetcher } = useFetcher();
  const [isResolving, setIsResolving] = useState(false);

  const resolveAuthentication = useCallback(
    async (resolution: ResolveAuthenticationRequest) => {
      setIsResolving(true);

      try {
        const request = getResolveAuthenticationRequest(owner.sId, resolution);
        if (!request) {
          return { success: false };
        }
        await fetcher(request.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...frameShareTokenHeader(frameShareToken),
          },
          body: JSON.stringify(request.body),
        });

        return { success: true };
      } catch (error) {
        if (isAlreadyResolvedError(error)) {
          return { success: true };
        }

        const label = getAuthenticationKindLabel(resolution);
        sendNotification({
          type: "error",
          title: `Failed to complete ${label}`,
          description: `The tool could not resume after ${label}. Please try again.`,
        });
        return { success: false };
      } finally {
        setIsResolving(false);
      }
    },
    [owner.sId, sendNotification, fetcher, frameShareToken]
  );

  return { resolveAuthentication, isResolving };
}

interface UseValidateActionParams {
  owner: LightWorkspaceType;
  onError: (errorMessage: string) => void;
  /** Share token of the frame hosting the action, presented as an invocation capability. */
  frameShareToken?: string;
}

export function useValidateAction({
  owner,
  onError,
  frameShareToken,
}: UseValidateActionParams) {
  const { fetcher } = useFetcher();
  const [isValidating, setIsValidating] = useState(false);

  const validateAction = useCallback(
    async (validation: ValidateActionRequest) => {
      setIsValidating(true);

      try {
        const request = getValidateActionRequest(owner.sId, validation);
        if (!request) {
          return { success: false };
        }
        await fetcher(request.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...frameShareTokenHeader(frameShareToken),
          },
          body: JSON.stringify(request.body),
        });

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
    [owner.sId, onError, fetcher, frameShareToken]
  );

  return { validateAction, isValidating };
}
