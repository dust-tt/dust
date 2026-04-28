import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  GetWorkspaceSandboxAgentEgressRequestsResponseBody,
  PutWorkspaceSandboxAgentEgressRequestsResponseBody,
} from "@app/pages/api/w/[wId]/sandbox/agent-egress-requests";
import type {
  GetWorkspaceEgressPolicyResponseBody,
  PutWorkspaceEgressPolicyResponseBody,
} from "@app/pages/api/w/[wId]/sandbox/egress-policy";
import type { EgressPolicy } from "@app/types/sandbox/egress_policy";
import { EMPTY_EGRESS_POLICY } from "@app/types/sandbox/egress_policy";
import type { LightWorkspaceType } from "@app/types/user";
import { useState } from "react";
import type { Fetcher } from "swr";

function workspaceEgressPolicyUrl(workspaceId: string) {
  return `/api/w/${workspaceId}/sandbox/egress-policy`;
}

function workspaceSandboxAgentEgressRequestsUrl(workspaceId: string) {
  return `/api/w/${workspaceId}/sandbox/agent-egress-requests`;
}

export function useWorkspaceEgressPolicy({
  owner,
  disabled = false,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const policyFetcher: Fetcher<GetWorkspaceEgressPolicyResponseBody> = fetcher;
  const { data, error, mutate, isLoading } = useSWRWithDefaults(
    workspaceEgressPolicyUrl(owner.sId),
    policyFetcher,
    { disabled }
  );

  return {
    policy: data?.policy ?? EMPTY_EGRESS_POLICY,
    isWorkspaceEgressPolicyLoading: isLoading,
    isWorkspaceEgressPolicyError: !!error,
    mutateWorkspaceEgressPolicy: mutate,
  };
}

export function useWorkspaceSandboxAgentEgressRequests({
  owner,
  disabled = false,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const agentEgressRequestsFetcher: Fetcher<GetWorkspaceSandboxAgentEgressRequestsResponseBody> =
    fetcher;
  const { data, error, mutate, isLoading } = useSWRWithDefaults(
    workspaceSandboxAgentEgressRequestsUrl(owner.sId),
    agentEgressRequestsFetcher,
    { disabled }
  );

  return {
    allowAgentEgressRequests: data?.allowAgentEgressRequests ?? false,
    isWorkspaceSandboxAgentEgressRequestsLoading: !disabled && isLoading,
    isWorkspaceSandboxAgentEgressRequestsError: !!error,
    mutateWorkspaceSandboxAgentEgressRequests: mutate,
  };
}

export function useUpdateWorkspaceSandboxAgentEgressRequests({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();
  const [isUpdating, setIsUpdating] = useState(false);
  const { mutateWorkspaceSandboxAgentEgressRequests } =
    useWorkspaceSandboxAgentEgressRequests({
      owner,
      disabled: true,
    });

  const updateWorkspaceSandboxAgentEgressRequests = async (
    enabled: boolean
  ): Promise<boolean> => {
    setIsUpdating(true);
    try {
      const response = await clientFetch(
        workspaceSandboxAgentEgressRequestsUrl(owner.sId),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ enabled }),
        }
      );

      if (!response.ok) {
        const error = await getErrorFromResponse(response);
        sendNotification({
          type: "error",
          title: "Failed to update sandbox network setting",
          description: error.message,
        });
        return false;
      }

      const data: PutWorkspaceSandboxAgentEgressRequestsResponseBody =
        await response.json();
      await mutateWorkspaceSandboxAgentEgressRequests(
        { allowAgentEgressRequests: data.allowAgentEgressRequests },
        false
      );
      sendNotification({
        type: "success",
        title: "Sandbox network setting updated",
        description:
          "Agent-requested sandbox domains setting has been updated.",
      });
      return true;
    } catch {
      sendNotification({
        type: "error",
        title: "Failed to update sandbox network setting",
        description: "An unexpected error occurred. Please try again.",
      });
      return false;
    } finally {
      setIsUpdating(false);
    }
  };

  return {
    updateWorkspaceSandboxAgentEgressRequests,
    isUpdatingWorkspaceSandboxAgentEgressRequests: isUpdating,
  };
}

export function useUpdateWorkspaceEgressPolicy({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();
  const [isUpdating, setIsUpdating] = useState(false);
  const { mutateWorkspaceEgressPolicy } = useWorkspaceEgressPolicy({
    owner,
    disabled: true,
  });

  const updateWorkspaceEgressPolicy = async (
    policy: EgressPolicy
  ): Promise<boolean> => {
    setIsUpdating(true);
    try {
      const response = await clientFetch(workspaceEgressPolicyUrl(owner.sId), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(policy),
      });

      if (!response.ok) {
        const error = await getErrorFromResponse(response);
        sendNotification({
          type: "error",
          title: "Failed to update network policy",
          description: error.message,
        });
        return false;
      }

      const data: PutWorkspaceEgressPolicyResponseBody = await response.json();
      await mutateWorkspaceEgressPolicy({ policy: data.policy }, false);
      sendNotification({
        type: "success",
        title: "Network policy updated",
        description:
          "Sandbox egress policy changes will be applied by the proxy cache shortly.",
      });
      return true;
    } catch {
      sendNotification({
        type: "error",
        title: "Failed to update network policy",
        description: "An unexpected error occurred. Please try again.",
      });
      return false;
    } finally {
      setIsUpdating(false);
    }
  };

  return {
    updateWorkspaceEgressPolicy,
    isUpdatingWorkspaceEgressPolicy: isUpdating,
  };
}
