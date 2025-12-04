import { useMemo } from "react";
import type { Fetcher } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress";
import {
  emptyArray,
  fetcher,
  getErrorFromResponse,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { WorkOSConnectionSyncStatus } from "@app/lib/types/workos";
import type { GetWorkspaceDomainsResponseBody } from "@app/pages/api/w/[wId]/domains";
import type { GetProvisioningStatusResponseBody } from "@app/pages/api/w/[wId]/provisioning-status";
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
    const response = await clientFetch(`/api/w/${owner.sId}/domains`, {
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
    const response = await clientFetch(`/api/w/${owner.sId}/sso`, {
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

/**
 * Directory sync.
 */

export function useWorkOSDSyncStatus({
  disabled,
  owner,
}: {
  disabled?: boolean;
  owner: LightWorkspaceType;
}) {
  const { data, error, isLoading, mutate } = useSWRWithDefaults<
    string,
    WorkOSConnectionSyncStatus
  >(`/api/w/${owner.sId}/dsync`, fetcher, { disabled });

  return {
    dsyncStatus: data,
    error,
    isLoading,
    mutate,
  };
}

export function useDisableWorkOSDirectorySyncConnection({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { mutate } = useWorkOSDSyncStatus({ owner, disabled: true });
  const sendNotification = useSendNotification();

  const doDisableWorkOSDirectorySyncConnection = async () => {
    const response = await clientFetch(`/api/w/${owner.sId}/dsync`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await getErrorFromResponse(response);
      sendNotification({
        type: "error",
        title: "Failed to disable WorkOS Directory Sync",
        description: errorData.message,
      });

      return null;
    } else {
      void mutate();

      sendNotification({
        type: "success",
        title: "WorkOS Directory Sync disabled",
        description:
          "WorkOS Directory Sync has been disabled for the workspace.",
      });
    }
  };

  return {
    doDisableWorkOSDirectorySyncConnection,
  };
}

export function useProvisioningStatus({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const provisioningStatusFetcher: Fetcher<GetProvisioningStatusResponseBody> =
    fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${workspaceId}/provisioning-status`,
    provisioningStatusFetcher,
    {
      disabled,
    }
  );

  const roleProvisioningStatus = useMemo(() => {
    if (!data) {
      return {
        hasAdminGroup: false,
        hasBuilderGroup: false,
      };
    }
    return data;
  }, [data]);

  return {
    roleProvisioningStatus,
    isProvisioningStatusLoading: !error && !data && !disabled,
    isProvisioningStatusError: error,
  };
}
