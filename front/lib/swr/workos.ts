import useSWR from "swr";
import { WorkOSPortalIntent } from "@app/lib/types/workos";

import { fetcher } from "@app/lib/swr/swr";

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

export function useCreateWorkOSOrganization(workspaceId: string) {

  const createOrganization = async () => {
    if (!workspaceId) return;
    
    const response = await fetch(`/api/w/${workspaceId}/workos/organization`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error("Failed to create WorkOS organization");
    }

    const result = await response.json();
    return result;
  };

  return {
    createOrganization,
  };
} 