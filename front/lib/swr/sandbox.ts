import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type { PatchSandboxEnvVarResponseBody } from "@app/lib/resources/sandbox_env_var_resource";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  GetWorkspaceEgressPolicyResponseBody,
  PutWorkspaceEgressPolicyResponseBody,
} from "@app/types/api/sandbox/egress_policy";
import type {
  GetSandboxEnvVarsResponseBody,
  PostSandboxEnvVarsResponseBody,
} from "@app/types/api/sandbox/env_vars";
import type { EgressPolicy } from "@app/types/sandbox/egress_policy";
import { EMPTY_EGRESS_POLICY } from "@app/types/sandbox/egress_policy";
import type {
  SandboxEnvVarKind,
  SandboxEnvVarType,
} from "@app/types/sandbox/env_var";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useState } from "react";
import type { Fetcher } from "swr";

function workspaceEgressPolicyUrl(workspaceId: string) {
  return `/api/w/${workspaceId}/sandbox/egress-policy`;
}

// Workspace-scoped env vars live under /sandbox/env-vars; pod-scoped ones
// under /spaces/:spaceId/sandbox/env-vars. Response shapes are identical.
function sandboxEnvVarsUrl(workspaceId: string, spaceId?: string) {
  return spaceId
    ? `/api/w/${workspaceId}/spaces/${spaceId}/sandbox/env-vars`
    : `/api/w/${workspaceId}/sandbox/env-vars`;
}

type SandboxEnvVarWritePayload = {
  name: string;
  value: string;
  kind?: SandboxEnvVarKind;
  allowedDomains?: string[] | null;
};

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
    requestedDomains: data?.requestedDomains ?? emptyArray(),
    isWorkspaceEgressPolicyLoading: disabled ? false : isLoading,
    isWorkspaceEgressPolicyError: !!error,
    mutateWorkspaceEgressPolicy: mutate,
  };
}

export function useSandboxEnvVars({
  owner,
  spaceId,
  disabled = false,
}: {
  owner: LightWorkspaceType;
  spaceId?: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const envVarsFetcher: Fetcher<GetSandboxEnvVarsResponseBody> = fetcher;
  const { data, error, mutate, isLoading } = useSWRWithDefaults(
    sandboxEnvVarsUrl(owner.sId, spaceId),
    envVarsFetcher,
    { disabled }
  );

  return {
    envVars: data?.envVars ?? emptyArray(),
    isSandboxEnvVarsLoading: disabled ? false : isLoading,
    isSandboxEnvVarsError: !!error,
    mutateSandboxEnvVars: mutate,
  };
}

export function useUpsertSandboxEnvVar({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId?: string;
}) {
  const sendNotification = useSendNotification();
  const [isUpserting, setIsUpserting] = useState(false);
  const { mutateSandboxEnvVars } = useSandboxEnvVars({
    owner,
    spaceId,
    disabled: true,
  });

  const upsertSandboxEnvVar = async ({
    allowedDomains,
    kind,
    name,
    value,
  }: SandboxEnvVarWritePayload): Promise<boolean> => {
    setIsUpserting(true);
    try {
      const response = await clientFetch(
        sandboxEnvVarsUrl(owner.sId, spaceId),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ allowedDomains, kind, name, value }),
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

      const data: PostSandboxEnvVarsResponseBody = await response.json();
      await mutateSandboxEnvVars();
      sendNotification({
        type: "success",
        title: data.created
          ? "Environment variable created"
          : "Environment variable replaced",
        description: spaceId
          ? `${name} has been saved for future Computers in this Pod.`
          : `${name} has been saved for future Computers.`,
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
    upsertSandboxEnvVar,
    isUpsertingSandboxEnvVar: isUpserting,
  };
}

export function usePatchSandboxEnvVar({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId?: string;
}) {
  const sendNotification = useSendNotification();
  const [isPatching, setIsPatching] = useState(false);
  const { mutateSandboxEnvVars } = useSandboxEnvVars({
    owner,
    spaceId,
    disabled: true,
  });

  const patchSandboxEnvVar = async ({
    allowedDomains,
    envVar,
    kind,
  }: {
    envVar: SandboxEnvVarType;
    kind?: SandboxEnvVarKind;
    allowedDomains?: string[] | null;
  }): Promise<boolean> => {
    setIsPatching(true);
    try {
      const response = await clientFetch(
        `${sandboxEnvVarsUrl(owner.sId, spaceId)}/${envVar.sId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ allowedDomains, kind }),
        }
      );

      if (!response.ok) {
        const error = await getErrorFromResponse(response);
        sendNotification({
          type: "error",
          title: "Failed to update environment variable",
          description: error.message,
        });
        return false;
      }

      const data: PatchSandboxEnvVarResponseBody = await response.json();
      await mutateSandboxEnvVars();
      sendNotification({
        type: "success",
        title:
          data.envVar.kind === "https_secret"
            ? "Environment variable secured"
            : "Environment variable updated",
        description: spaceId
          ? `${data.envVar.name} has been updated for future Computers in this Pod.`
          : `${data.envVar.name} has been updated for future Computers.`,
      });
      return true;
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update environment variable",
        description: normalizeError(error).message,
      });
      return false;
    } finally {
      setIsPatching(false);
    }
  };

  return {
    patchSandboxEnvVar,
    isPatchingSandboxEnvVar: isPatching,
  };
}

export function useDeleteSandboxEnvVar({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId?: string;
}) {
  const sendNotification = useSendNotification();
  const [isDeleting, setIsDeleting] = useState(false);
  const { mutateSandboxEnvVars } = useSandboxEnvVars({
    owner,
    spaceId,
    disabled: true,
  });

  const deleteSandboxEnvVar = async (
    envVar: SandboxEnvVarType
  ): Promise<boolean> => {
    setIsDeleting(true);
    try {
      const response = await clientFetch(
        `${sandboxEnvVarsUrl(owner.sId, spaceId)}/${envVar.sId}`,
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

      await mutateSandboxEnvVars();
      sendNotification({
        type: "success",
        title: "Environment variable deleted",
        description: spaceId
          ? `${envVar.name} has been removed for future Computers in this Pod.`
          : `${envVar.name} has been removed for future Computers.`,
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
    deleteSandboxEnvVar,
    isDeletingSandboxEnvVar: isDeleting,
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
        throw new Error("Failed to update Computer network setting");
      }

      setIsEnabled(enabled);
      sendNotification({
        type: "success",
        title: "Computer network setting updated",
        description:
          "Agent-requested Computer domains setting has been updated.",
      });
      return true;
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update Computer network setting",
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
      // Keep requestedDomains, or the other pending rows vanish until refetch.
      await mutateWorkspaceEgressPolicy(
        {
          policy: data.policy,
          requestedDomains: (data.policy.requestedDomains ?? []).map(
            ({ domain: d, requestedAtMs }) => ({ domain: d, requestedAtMs })
          ),
        },
        false
      );
      sendNotification({
        type: "success",
        title: "Network policy updated",
        description:
          "Computer egress policy changes will be applied by the proxy cache shortly.",
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

export function useDismissWorkspaceEgressRequest({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();
  const [isDismissingRequest, setIsDismissing] = useState(false);
  const { mutateWorkspaceEgressPolicy } = useWorkspaceEgressPolicy({
    owner,
    disabled: true,
  });

  const dismissWorkspaceEgressRequest = async (
    domain: string
  ): Promise<boolean> => {
    setIsDismissing(true);
    try {
      const response = await clientFetch(
        `${workspaceEgressPolicyUrl(owner.sId)}/requests/dismiss`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain }),
        }
      );

      if (!response.ok) {
        const error = await getErrorFromResponse(response);
        sendNotification({
          type: "error",
          title: "Failed to reject domain request",
          description: error.message,
        });
        return false;
      }

      const data: PutWorkspaceEgressPolicyResponseBody = await response.json();
      await mutateWorkspaceEgressPolicy(
        {
          policy: data.policy,
          requestedDomains: (data.policy.requestedDomains ?? []).map(
            ({ domain: d, requestedAtMs }) => ({ domain: d, requestedAtMs })
          ),
        },
        false
      );
      return true;
    } catch {
      sendNotification({
        type: "error",
        title: "Failed to reject domain request",
        description: "An unexpected error occurred. Please try again.",
      });
      return false;
    } finally {
      setIsDismissing(false);
    }
  };

  return { dismissWorkspaceEgressRequest, isDismissingRequest };
}
