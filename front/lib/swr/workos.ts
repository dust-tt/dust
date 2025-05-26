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

export function useCreateWorkOSOrganization(workspaceId: string) {
  const createOrganization = async () => {
    if (!workspaceId) {
      return;
    }

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

    const { organizationId } = await response.json();
    const result = await fetch(`/api/w/${workspaceId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workOSOrganizationId: organizationId,
      }),
    });

    if (!result.ok) {
      throw new Error("Failed to update workspace with WorkOS organization ID");
    }

    return {
      ok: true,
      organizationId,
    };
  };

  return {
    createOrganization,
  };
}
