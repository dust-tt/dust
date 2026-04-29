import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  GetWorkspaceEgressPolicyResponseBody,
  PutWorkspaceEgressPolicyResponseBody,
} from "@app/pages/api/w/[wId]/sandbox/egress-policy";
import type {
  GetWorkspaceSandboxEnvVarsResponseBody,
  PostWorkspaceSandboxEnvVarsResponseBody,
} from "@app/pages/api/w/[wId]/sandbox/env-vars";
import type { EgressPolicy } from "@app/types/sandbox/egress_policy";
import { EMPTY_EGRESS_POLICY } from "@app/types/sandbox/egress_policy";
import type { WorkspaceSandboxEnvVarType } from "@app/types/sandbox/env_var";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useState } from "react";
import type { Fetcher } from "swr";

function workspaceEgressPolicyUrl(workspaceId: string) {
  return `/api/w/${workspaceId}/sandbox/egress-policy`;
}

function workspaceSandboxEnvVarsUrl(workspaceId: string) {
  return `/api/w/${workspaceId}/sandbox/env-vars`;
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

export function useWorkspaceSandboxEnvVars({
  owner,
  disabled = false,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const envVarsFetcher: Fetcher<GetWorkspaceSandboxEnvVarsResponseBody> =
    fetcher;
  const { data, error, mutate, isLoading } = useSWRWithDefaults(
    workspaceSandboxEnvVarsUrl(owner.sId),
    envVarsFetcher,
    { disabled }
  );

  return {
    envVars: data?.envVars ?? emptyArray(),
    isWorkspaceSandboxEnvVarsLoading: disabled ? false : isLoading,
    isWorkspaceSandboxEnvVarsError: !!error,
    mutateWorkspaceSandboxEnvVars: mutate,
  };
}

export function useUpsertWorkspaceSandboxEnvVar({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();
  const [isUpserting, setIsUpserting] = useState(false);
  const { mutateWorkspaceSandboxEnvVars } = useWorkspaceSandboxEnvVars({
    owner,
    disabled: true,
  });

  const upsertWorkspaceSandboxEnvVar = async ({
    name,
    value,
  }: {
    name: string;
    value: string;
  }): Promise<boolean> => {
    setIsUpserting(true);
    try {
      const response = await clientFetch(
        workspaceSandboxEnvVarsUrl(owner.sId),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name, value }),
        }
      );

      if (!response.ok) {
        const error = await getErrorFromResponse(response);
        sendNotification({
          type: "error",
          title: "Failed to save environment variable",
          description: error.message,
        });
        return false;
      }

      const data: PostWorkspaceSandboxEnvVarsResponseBody =
        await response.json();
      await mutateWorkspaceSandboxEnvVars();
      sendNotification({
        type: "success",
        title: data.created
          ? "Environment variable created"
          : "Environment variable replaced",
        description: `${name} has been saved for future sandboxes.`,
      });
      return true;
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to save environment variable",
        description: normalizeError(error).message,
      });
      return false;
    } finally {
      setIsUpserting(false);
    }
  };

  return {
    upsertWorkspaceSandboxEnvVar,
    isUpsertingWorkspaceSandboxEnvVar: isUpserting,
  };
}

export function useDeleteWorkspaceSandboxEnvVar({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();
  const [isDeleting, setIsDeleting] = useState(false);
  const { mutateWorkspaceSandboxEnvVars } = useWorkspaceSandboxEnvVars({
    owner,
    disabled: true,
  });

  const deleteWorkspaceSandboxEnvVar = async (
    envVar: WorkspaceSandboxEnvVarType
  ): Promise<boolean> => {
    setIsDeleting(true);
    try {
      const response = await clientFetch(
        `${workspaceSandboxEnvVarsUrl(owner.sId)}/${encodeURIComponent(
          envVar.name
        )}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const error = await getErrorFromResponse(response);
        sendNotification({
          type: "error",
          title: "Failed to delete environment variable",
          description: error.message,
        });
        return false;
      }

      await mutateWorkspaceSandboxEnvVars();
      sendNotification({
        type: "success",
        title: "Environment variable deleted",
        description: `${envVar.name} has been deleted.`,
      });
      return true;
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to delete environment variable",
        description: normalizeError(error).message,
      });
      return false;
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    deleteWorkspaceSandboxEnvVar,
    isDeletingWorkspaceSandboxEnvVar: isDeleting,
  };
}

export function useUpdateWorkspaceSandboxAgentEgressRequests({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();
  const [isUpdating, setIsUpdating] = useState(false);
  const [isEnabled, setIsEnabled] = useState(
    owner.metadata?.sandboxAllowAgentEgressRequests === true
  );

  const updateWorkspaceSandboxAgentEgressRequests = async (
    enabled: boolean
  ): Promise<boolean> => {
    setIsUpdating(true);
    try {
      const response = await clientFetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sandboxAllowAgentEgressRequests: enabled }),
      });

      if (!response.ok) {
        throw new Error("Failed to update sandbox network setting");
      }

      setIsEnabled(enabled);
      sendNotification({
        type: "success",
        title: "Sandbox network setting updated",
        description:
          "Agent-requested sandbox domains setting has been updated.",
      });
      return true;
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update sandbox network setting",
        description: normalizeError(error).message,
      });
      return false;
    } finally {
      setIsUpdating(false);
    }
  };

  return {
    allowAgentEgressRequests: isEnabled,
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
