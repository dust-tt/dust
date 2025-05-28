import useSWR from "swr";

import { fetcher } from "@app/lib/swr/swr";
import type { WorkOSPortalIntent } from "@app/lib/types/workos";

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
