import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import type {
  AuditLogsPortal,
  AuditLogsPortalResponse,
} from "@app/lib/api/audit/workos_audit";
import { clientFetch } from "@app/lib/egress/client";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { WorkOSConnectionSyncStatus } from "@app/lib/types/workos";
import type { GetWorkspaceDomainsResponseBody } from "@app/types/api/workos/organization";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";

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
  const { fetcher } = useFetcher();
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
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
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
      sendApiErrorNotification({
        title: t`Failed to remove domain`,
        error: errorData,
      });

      return null;
    } else {
      void mutate();

      sendNotification({
        type: "success",
        title: t`Domain removed`,
        description: t`The domain has been removed from the workspace.`,
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
  const { fetcher } = useFetcher();
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
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
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
      sendApiErrorNotification({
        title: t`Failed to disable WorkOS SSO`,
        error: errorData,
      });

      return null;
    } else {
      void mutate();

      sendNotification({
        type: "success",
        title: t`WorkOS SSO disabled`,
        description: t`WorkOS SSO has been disabled for the workspace.`,
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
  const { fetcher } = useFetcher();
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
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
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
      sendApiErrorNotification({
        title: t`Failed to disable WorkOS Directory Sync`,
        error: errorData,
      });

      return null;
    } else {
      void mutate();

      sendNotification({
        type: "success",
        title: t`WorkOS Directory Sync disabled`,
        description: t`WorkOS Directory Sync has been disabled for the workspace.`,
      });
    }
  };

  return {
    doDisableWorkOSDirectorySyncConnection,
  };
}

/**
 * Audit Logs
 */

export function useOpenAuditLogsPortal({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();

  const openPortal = async (portal: AuditLogsPortal) => {
    // Open a blank window synchronously to avoid popup blockers.
    const newWindow = window.open("", "_blank");

    const response = await clientFetch(`/api/w/${owner.sId}/audit-logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portal }),
    });

    if (!response.ok) {
      newWindow?.close();
      const errorData = await getErrorFromResponse(response);
      sendApiErrorNotification({
        title: t`Failed to open audit logs portal`,
        error: errorData,
      });
      return;
    }

    const data: AuditLogsPortalResponse = await response.json();
    if (newWindow) {
      newWindow.location.href = data.portalUrl;
    }
  };

  return { openPortal };
}
