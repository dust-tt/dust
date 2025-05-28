import useSWR from "swr";

import { fetcher } from "@app/lib/swr/swr";
import type {
  WorkOSConnectionSyncStatus,
  WorkOSPortalIntent,
} from "@app/lib/types/workos";

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

export function useWorkOSSSOStatus(workspaceId: string) {
  const { data, error, isLoading } = useSWR<WorkOSConnectionSyncStatus>(
    `/api/w/${workspaceId}/workos/sso`,
    fetcher
  );

  return {
    ssoStatus: data,
    isLoading,
    error,
  };
}

export function useWorkOSDSyncStatus(workspaceId: string) {
  const { data, error, isLoading } = useSWR<WorkOSConnectionSyncStatus>(
    `/api/w/${workspaceId}/workos/dsync`,
    fetcher
  );

  return {
    dsyncStatus: data,
    isLoading,
    error,
  };
}
