import { useSendNotification } from "@dust-tt/sparkle";

import {
  emptyArray,
  fetcher,
  getErrorFromResponse,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  WorkOSConnectionSyncStatus,
  WorkOSPortalIntent,
} from "@app/lib/types/workos";
import type { GetWorkspaceDomainsResponseBody } from "@app/pages/api/w/[wId]/domains";
import type { LightWorkspaceType } from "@app/types";

/**
 * Workspace domains
 */

export function useWorkspaceDomains({
  disabled,
  owner,
}: {
  disabled?: boolean;
  owner: LightWorkspaceType;
}) {
  const { data, error, mutate } = useSWRWithDefaults<
    string,
    GetWorkspaceDomainsResponseBody
  >(`/api/w/${owner.sId}/domains`, fetcher, {
    disabled,
  });

  return {
    addDomainLink: data?.addDomainLink,
    domains: data?.domains ?? emptyArray(),
    isDomainsError: error,
    isDomainsLoading: !error && !data,
    mutate,
  };
}

export function useRemoveWorkspaceDomain({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { mutate } = useWorkspaceDomains({ owner, disabled: true });
  const sendNotification = useSendNotification();

  const doRemoveWorkspaceDomain = async (domain: string) => {
    const response = await fetch(`/api/w/${owner.sId}/domains`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ domain }),
    });

    if (!response.ok) {
      const errorData = await getErrorFromResponse(response);
      sendNotification({
        type: "error",
        title: "Failed to remove domain",
        description: errorData.message,
      });

      return null;
    } else {
      void mutate();

      sendNotification({
        type: "success",
        title: "Domain removed",
        description: "The domain has been removed from the workspace.",
      });
    }
  };

  return {
    doRemoveWorkspaceDomain,
  };
}

/**
 * SSO
 */

export function useWorkOSSSOStatus({
  disabled,
  owner,
}: {
  disabled?: boolean;
  owner: LightWorkspaceType;
}) {
  const { data, error, isLoading, mutate } = useSWRWithDefaults<
    string,
    WorkOSConnectionSyncStatus
  >(`/api/w/${owner.sId}/sso`, fetcher, { disabled });

  return {
    ssoStatus: data,
    setupSSOLink: data?.setupSSOLink,
    isLoading,
    error,
    mutate,
  };
}

export function useDisableWorkOSSSOConnection({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { mutate } = useWorkOSSSOStatus({ owner, disabled: true });
  const sendNotification = useSendNotification();

  const doDisableWorkOSSSOConnection = async () => {
    const response = await fetch(`/api/w/${owner.sId}/sso`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await getErrorFromResponse(response);
      sendNotification({
        type: "error",
        title: "Failed to disable WorkOS SSO",
        description: errorData.message,
      });

      return null;
    } else {
      void mutate();

      sendNotification({
        type: "success",
        title: "WorkOS SSO disabled",
        description: "WorkOS SSO has been disabled for the workspace.",
      });
    }
  };

  return {
    doDisableWorkOSSSOConnection,
  };
}

export function useWorkOSAdminPortalUrl(
  workspaceId: string,
  intent: WorkOSPortalIntent
) {
  const { data, error, isLoading } = useSWRWithDefaults<
    string,
    { url: string }
  >(`/api/w/${workspaceId}/workos/admin-portal?intent=${intent}`, fetcher);

  return {
    adminPortalUrl: data?.url,
    isLoading,
    error,
  };
}

export function useWorkOSDSyncStatus(workspace: LightWorkspaceType) {
  const { data, error, isLoading } = useSWRWithDefaults<
    string,
    WorkOSConnectionSyncStatus
  >(`/api/w/${workspace.sId}/workos/dsync`, fetcher);

  return {
    dsyncStatus: data,
    isLoading,
    error,
  };
}
