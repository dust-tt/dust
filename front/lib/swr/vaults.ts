import type {
  APIError,
  DataSourceType,
  DataSourceViewCategory,
  LightWorkspaceType,
  VaultType,
} from "@dust-tt/types";
import { useContext, useMemo } from "react";
import type { Fetcher } from "swr";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { getDataSourceName } from "@app/lib/data_sources";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { getVaultName } from "@app/lib/vaults";
import type {
  GetVaultsResponseBody,
  PostVaultsResponseBody,
} from "@app/pages/api/w/[wId]/vaults";
import type {
  GetVaultResponseBody,
  PatchVaultResponseBody,
} from "@app/pages/api/w/[wId]/vaults/[vId]";
import type { GetVaultDataSourceViewsResponseBody } from "@app/pages/api/w/[wId]/vaults/[vId]/data_source_views";
import type { PostVaultDataSourceResponseBody } from "@app/pages/api/w/[wId]/vaults/[vId]/data_sources";

export function useVaults({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const vaultsFetcher: Fetcher<GetVaultsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/vaults`,
    vaultsFetcher,
    { disabled }
  );

  return {
    vaults: useMemo(() => (data ? data.vaults : []), [data]),
    isVaultsLoading: !error && !data && !disabled,
    isVaultsError: error,
    mutate,
  };
}

export function useVaultsAsAdmin({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const vaultsFetcher: Fetcher<GetVaultsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/vaults?role=admin`,
    vaultsFetcher,
    { disabled }
  );

  return {
    vaults: useMemo(() => (data ? data.vaults : []), [data]),
    isVaultsLoading: !error && !data && !disabled,
    isVaultsError: error,
    mutate,
  };
}

export function useVaultInfo({
  workspaceId,
  vaultId,
  disabled,
}: {
  workspaceId: string;
  vaultId: string | null;
  disabled?: boolean;
}) {
  const vaultsCategoriesFetcher: Fetcher<GetVaultResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/vaults/${vaultId}`,
    vaultsCategoriesFetcher,
    {
      disabled: disabled || vaultId === null,
    }
  );

  return {
    vaultInfo: data ? data.vault : null,
    mutateVaultInfo: mutate,
    isVaultInfoLoading: !error && !data,
    isVaultInfoError: error,
  };
}

export function useVaultDataSourceViews<
  IncludeConnectorDetails extends boolean,
>({
  category,
  disabled,
  includeConnectorDetails,
  includeEditedBy,
  vaultId,
  workspaceId,
}: {
  category?: Exclude<DataSourceViewCategory, "apps">;
  disabled?: boolean;
  includeConnectorDetails?: IncludeConnectorDetails;
  includeEditedBy?: boolean;
  vaultId: string;
  workspaceId: string;
}) {
  const vaultsDataSourceViewsFetcher: Fetcher<
    GetVaultDataSourceViewsResponseBody<IncludeConnectorDetails>
  > = fetcher;

  const queryParams = new URLSearchParams();
  if (category) {
    queryParams.set("category", category);
  }

  if (includeConnectorDetails) {
    queryParams.set("includeConnectorDetails", "true");
  }
  if (includeEditedBy) {
    queryParams.set("includeEditedBy", "true");
  }

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/vaults/${vaultId}/data_source_views?${queryParams.toString()}`,
    vaultsDataSourceViewsFetcher,
    { disabled }
  );

  const vaultDataSourceViews = useMemo(() => {
    return (data?.dataSourceViews ??
      []) as GetVaultDataSourceViewsResponseBody<IncludeConnectorDetails>["dataSourceViews"];
  }, [data]);

  return {
    vaultDataSourceViews,
    mutateVaultDataSourceViews: mutate,
    isVaultDataSourceViewsLoading: !error && !data,
    isVaultDataSourceViewsError: error,
  };
}

// Convenient hooks for creating, updating and deleting folders, handle mutations and notifications
export function useCreateFolder({
  owner,
  vaultId,
}: {
  owner: LightWorkspaceType;
  vaultId: string;
}) {
  const sendNotification = useContext(SendNotificationsContext);
  const { mutateVaultDataSourceViews } = useVaultDataSourceViews({
    workspaceId: owner.sId,
    vaultId: vaultId,
    category: "folder",
    disabled: true, // Needed just to mutate
  });

  // TODO(GROUPS_INFRA) - Ideally, it should be a DataSourceViewType
  const doCreate = async (name: string | null, description: string | null) => {
    if (!name || !description) {
      return null;
    }

    const res = await fetch(
      `/api/w/${owner.sId}/vaults/${vaultId}/data_sources`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description,
        }),
      }
    );
    if (res.ok) {
      void mutateVaultDataSourceViews();
      const response: PostVaultDataSourceResponseBody = await res.json();
      const { dataSourceView } = response;
      sendNotification({
        type: "success",
        title: "Successfully created folder",
        description: "Folder was successfully created.",
      });
      return dataSourceView;
    } else {
      const err: { error: APIError } = await res.json();
      sendNotification({
        type: "error",
        title: "Error creating Folder",
        description: `Error: ${err.error.message}`,
      });
      return null;
    }
  };

  return doCreate;
}

export function useUpdateFolder({
  owner,
  vaultId,
}: {
  owner: LightWorkspaceType;
  vaultId: string;
}) {
  const sendNotification = useContext(SendNotificationsContext);
  const { mutateVaultDataSourceViews } = useVaultDataSourceViews({
    workspaceId: owner.sId,
    vaultId: vaultId,
    category: "folder",
    disabled: true, // Needed just to mutate
  });

  // TODO(GROUPS_INFRA) - Ideally, it should be a DataSourceViewType
  const doUpdate = async (
    dataSource: DataSourceType | null,
    description: string | null
  ) => {
    if (!dataSource || !description) {
      return false;
    }
    const res = await fetch(
      // TODO(DATASOURCE_SID) - move to sId
      `/api/w/${owner.sId}/vaults/${vaultId}/data_sources/${dataSource.name}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description,
        }),
      }
    );
    if (res.ok) {
      void mutateVaultDataSourceViews();

      sendNotification({
        type: "success",
        title: "Successfully updated folder",
        description: "Folder was successfully updated.",
      });
    } else {
      const err: { error: APIError } = await res.json();
      sendNotification({
        type: "error",
        title: "Error updating Folder",
        description: `Error: ${err.error.message}`,
      });
    }
    return res.ok;
  };

  return doUpdate;
}

export function useDeleteFolderOrWebsite({
  owner,
  vaultId,
  category,
}: {
  owner: LightWorkspaceType;
  vaultId: string;
  category: Exclude<DataSourceViewCategory, "apps">;
}) {
  const sendNotification = useContext(SendNotificationsContext);
  const { mutateVaultDataSourceViews } = useVaultDataSourceViews({
    workspaceId: owner.sId,
    vaultId: vaultId,
    category: category,
    disabled: true, // Needed just to mutate
  });

  // TODO(GROUPS_INFRA) - Ideally, it should be a DataSourceViewType
  const doDelete = async (dataSource: DataSourceType | null) => {
    if (!dataSource) {
      return false;
    }
    // TODO(DATASOURCE_SID) - move to sId
    const res = await fetch(
      `/api/w/${owner.sId}/vaults/${vaultId}/data_sources/${dataSource.name}`,
      { method: "DELETE" }
    );

    if (res.ok) {
      void mutateVaultDataSourceViews();

      sendNotification({
        type: "success",
        title: `Successfully deleted ${category}`,
        description: `${getDataSourceName(dataSource)} was successfully deleted.`,
      });
    } else {
      const err: { error: APIError } = await res.json();
      sendNotification({
        type: "error",
        title: `Error deleting ${category}`,
        description: `Error: ${err.error.message}`,
      });
    }
    return res.ok;
  };

  return doDelete;
}

export function useCreateVault({ owner }: { owner: LightWorkspaceType }) {
  const sendNotification = useContext(SendNotificationsContext);
  const { mutate: mutateVaults } = useVaults({
    workspaceId: owner.sId,
    disabled: true, // Needed just to mutate
  });
  const { mutate: mutateVaultsAsAdmin } = useVaultsAsAdmin({
    workspaceId: owner.sId,
    disabled: true, // Needed just to mutate
  });

  const doCreate = async (name: string | null, memberIds: string[] | null) => {
    if (!name || !memberIds || memberIds?.length < 1) {
      return null;
    }

    const url = `/api/w/${owner.sId}/vaults`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        memberIds,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      sendNotification({
        type: "error",
        title: "Error creating Vault",
        description: `Error: ${errorData.message}`,
      });
      return null;
    } else {
      void mutateVaults();
      void mutateVaultsAsAdmin();

      sendNotification({
        type: "success",
        title: "Successfully created Vault",
        description: "Vault was successfully created.",
      });

      const response: PostVaultsResponseBody = await res.json();
      return response.vault;
    }
  };

  return doCreate;
}

export function useUpdateVault({ owner }: { owner: LightWorkspaceType }) {
  const sendNotification = useContext(SendNotificationsContext);
  const { mutate: mutateVaults } = useVaults({
    workspaceId: owner.sId,
    disabled: true, // Needed just to mutate
  });
  const { mutate: mutateVaultsAsAdmin } = useVaultsAsAdmin({
    workspaceId: owner.sId,
    disabled: true, // Needed just to mutate
  });

  const doUpdate = async (vault: VaultType, memberIds: string[] | null) => {
    if (!vault || !memberIds || memberIds?.length < 1) {
      return null;
    }

    // Note: we are directly updating the first group of the vault, maybe we want to hide this via a vault endpoint
    const url = `/api/w/${owner.sId}/groups/${vault.groupIds[0]}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        memberIds,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      sendNotification({
        type: "error",
        title: "Error updating Vault",
        description: `Error: ${errorData.message}`,
      });
      return null;
    } else {
      void mutateVaults();
      void mutateVaultsAsAdmin();

      sendNotification({
        type: "success",
        title: "Successfully updated Vault",
        description: "Vault was successfully updated.",
      });

      const response: PatchVaultResponseBody = await res.json();
      return response.vault;
    }
  };

  return doUpdate;
}

export function useDeleteVault({ owner }: { owner: LightWorkspaceType }) {
  const sendNotification = useContext(SendNotificationsContext);
  const { mutate: mutateVaults } = useVaults({
    workspaceId: owner.sId,
    disabled: true, // Needed just to mutate
  });
  const { mutate: mutateVaultsAsAdmin } = useVaultsAsAdmin({
    workspaceId: owner.sId,
    disabled: true, // Needed just to mutate
  });

  const doDelete = async (vault: VaultType | null) => {
    if (!vault) {
      return false;
    }
    const url = `/api/w/${owner.sId}/vaults/${vault.sId}`;
    const res = await fetch(url, {
      method: "DELETE",
    });

    if (res.ok) {
      void mutateVaults();
      void mutateVaultsAsAdmin();

      sendNotification({
        type: "success",
        title: `Successfully deleted ${getVaultName(vault)}`,
        description: `${getVaultName(vault)} was successfully deleted.`,
      });
    } else {
      const err: { error: APIError } = await res.json();
      sendNotification({
        type: "error",
        title: `Error deleting ${getVaultName(vault)}`,
        description: `Error: ${err.error.message}`,
      });
    }
    return res.ok;
  };

  return doDelete;
}

export function useSystemVault({
  workspaceId,
  disabled = false,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const systemVaultFetcher: Fetcher<GetVaultsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/vaults?role=admin&kind=system`,
    systemVaultFetcher,
    { disabled }
  );

  return {
    systemVault: data ? data.vaults[0] : null,
    isSystemVaultLoading: !error && !data && !disabled,
    isSystemVaultError: error,
    mutateSystemVault: mutate,
  };
}
