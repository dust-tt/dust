import useSWR from "swr";

import { fetcher } from "@app/lib/swr/swr";
import type {
  WorkOSConnectionSyncStatus,
  WorkOSPortalIntent,
} from "@app/lib/types/workos";
import type { LightWorkspaceType } from "@app/types";

export function useWorkOSAdminPortalUrl(
  workspaceId: string,
  intent: WorkOSPortalIntent
) {
  const { data, error, isLoading } = useSWR<{ url: string }>(
    `/api/w/${workspaceId}/workos/admin-portal?intent=${intent}`,
    fetcher
  );

  return {
    adminPortalUrl: data?.url,
    isLoading,
    error,
  };
}

export function useWorkOSSSOStatus(workspace: LightWorkspaceType) {
  const { data, error, isLoading } = useSWR<WorkOSConnectionSyncStatus>(
    `/api/w/${workspace.sId}/workos/sso`,
    fetcher
  );

  return {
    ssoStatus: data,
    isLoading,
    error,
  };
}

export function useWorkOSDSyncStatus(workspace: LightWorkspaceType) {
  const { data, error, isLoading } = useSWR<WorkOSConnectionSyncStatus>(
    `/api/w/${workspace.sId}/workos/dsync`,
    fetcher
  );

  return {
    dsyncStatus: data,
    isLoading,
    error,
  };
}
