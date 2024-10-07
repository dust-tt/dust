import type {
  DataSourceViewCategory,
  DataSourceViewType,
  LightWorkspaceType,
  VaultType,
} from "@dust-tt/types";
import { useContext, useMemo } from "react";
import type { Fetcher } from "swr";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import {
  fetcher,
  getErrorFromResponse,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
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
import type { GetDataSourceViewResponseBody } from "@app/pages/api/w/[wId]/vaults/[vId]/data_source_views/[dsvId]";
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
    isVaultInfoLoading: !error && !data && !disabled,
    isVaultInfoError: error,
  };
}

export function useVaultDataSourceView({
  owner,
  vaultId,
  dataSourceViewId,
  disabled,
}: {
  owner: LightWorkspaceType;
  vaultId: string;
  dataSourceViewId?: string;
  disabled?: boolean;
}) {
  const dataSourceViewsFetcher: Fetcher<GetDataSourceViewResponseBody> =
    fetcher;

  const { data, error, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(
      `/api/w/${owner.sId}/vaults/${vaultId}/data_source_views/${dataSourceViewId}`,
      dataSourceViewsFetcher,
      { disabled }
    );

  return {
    dataSourceView: data?.dataSourceView,
    isDataSourceViewLoading: !disabled && !error && !data,
    isDataSourceViewError: error,
    mutate,
    mutateRegardlessOfQueryParams,
  };
}

export function useVaultDataSourceViews({
  category,
  disabled,
  vaultId,
  workspaceId,
}: {
  category?: Exclude<DataSourceViewCategory, "apps">;
  disabled?: boolean;
  vaultId: string;
  workspaceId: string;
}) {
  const vaultsDataSourceViewsFetcher: Fetcher<
    GetVaultDataSourceViewsResponseBody<false>
  > = fetcher;

  const queryParams = new URLSearchParams();
  if (category) {
    queryParams.set("category", category);
  }

  const { data, error, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(
      `/api/w/${workspaceId}/vaults/${vaultId}/data_source_views?${queryParams.toString()}`,
      vaultsDataSourceViewsFetcher,
      { disabled }
    );

  const vaultDataSourceViews = useMemo(() => {
    return (data?.dataSourceViews ??
      []) as GetVaultDataSourceViewsResponseBody<false>["dataSourceViews"];
  }, [data]);

  return {
    vaultDataSourceViews,
    mutate,
    mutateRegardlessOfQueryParams,
    isVaultDataSourceViewsLoading: !disabled && !error && !data,
    isVaultDataSourceViewsError: error,
  };
}

export function useVaultDataSourceViewsWithDetails({
  category,
  disabled,
  vaultId,
  workspaceId,
}: {
  category: Exclude<DataSourceViewCategory, "apps">;
  disabled?: boolean;
  vaultId: string;
  workspaceId: string;
}) {
  const vaultsDataSourceViewsFetcher: Fetcher<
    GetVaultDataSourceViewsResponseBody<true>
  > = fetcher;

  const queryParams = new URLSearchParams();

  queryParams.set("category", category);
  queryParams.set("includeEditedBy", "true");
  queryParams.set("withDetails", "true");

  const { data, error, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(
      `/api/w/${workspaceId}/vaults/${vaultId}/data_source_views?${queryParams.toString()}`,
      vaultsDataSourceViewsFetcher,
      { disabled }
    );

  const vaultDataSourceViews = useMemo(() => {
    return (data?.dataSourceViews ??
      []) as GetVaultDataSourceViewsResponseBody<true>["dataSourceViews"];
  }, [data]);

  return {
    vaultDataSourceViews,
    mutate,
    mutateRegardlessOfQueryParams,
    isVaultDataSourceViewsLoading: !error && !data && !disabled,
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
  const { mutateRegardlessOfQueryParams: mutateVaultDataSourceViews } =
    useVaultDataSourceViews({
      workspaceId: owner.sId,
      vaultId: vaultId,
      category: "folder",
      disabled: true, // Needed just to mutate
    });

  const doCreate = async (name: string | null, description: string | null) => {
    if (!name) {
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
      const errorData = await getErrorFromResponse(res);

      sendNotification({
        type: "error",
        title: "Error creating Folder",
        description: `Error: ${errorData.message}`,
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
  const doUpdate = async (
    dataSourceView: DataSourceViewType | null,
    description: string | null
  ) => {
    if (!dataSourceView || !description) {
      return false;
    }
    const res = await fetch(
      `/api/w/${owner.sId}/vaults/${vaultId}/data_sources/${dataSourceView.dataSource.sId}`,
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
      sendNotification({
        type: "success",
        title: "Successfully updated folder",
        description: "Folder was successfully updated.",
      });
    } else {
      const errorData = await getErrorFromResponse(res);

      sendNotification({
        type: "error",
        title: "Error updating Folder",
        description: `Error: ${errorData.message}`,
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
  const { mutateRegardlessOfQueryParams: mutateVaultDataSourceViews } =
    useVaultDataSourceViews({
      workspaceId: owner.sId,
      vaultId: vaultId,
      category: category,
      disabled: true, // Needed just to mutate
    });

  const doDelete = async (dataSourceView: DataSourceViewType | undefined) => {
    if (!dataSourceView) {
      return false;
    }
    const res = await fetch(
      `/api/w/${owner.sId}/vaults/${vaultId}/data_sources/${dataSourceView.dataSource.sId}`,
      { method: "DELETE" }
    );

    if (res.ok) {
      await mutateVaultDataSourceViews();

      sendNotification({
        type: "success",
        title: `Successfully deleted ${category}`,
        description: `${getDisplayNameForDataSource(dataSourceView.dataSource)} was successfully deleted.`,
      });
    } else {
      const errorData = await getErrorFromResponse(res);

      sendNotification({
        type: "error",
        title: `Error deleting ${category}`,
        description: `Error: ${errorData.message}`,
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
      const errorData = await getErrorFromResponse(res);

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

  const doUpdate = async (
    vault: VaultType,
    memberIds: string[] | null,
    newName: string | null
  ) => {
    if (!vault) {
      return null;
    }

    const updatePromises: Promise<Response>[] = [];

    // Prepare vault update request
    if (newName) {
      const vaultUrl = `/api/w/${owner.sId}/vaults/${vault.sId}`;
      updatePromises.push(
        fetch(vaultUrl, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: newName,
          }),
        })
      );
    }

    // Prepare group members update request if provided
    if (memberIds && memberIds.length > 0) {
      const groupUrl = `/api/w/${owner.sId}/groups/${vault.groupIds[0]}`;
      updatePromises.push(
        fetch(groupUrl, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            memberIds,
          }),
        })
      );
    }

    if (updatePromises.length === 0) {
      return null;
    }

    const results = await Promise.all(updatePromises);

    for (const res of results) {
      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);

        sendNotification({
          type: "error",
          title: "Error updating Vault",
          description: `Error: ${errorData.message}`,
        });
        return null;
      }
    }
    void mutateVaults();
    void mutateVaultsAsAdmin();

    sendNotification({
      type: "success",
      title: "Successfully updated Vault",
      description: "Vault was successfully updated.",
    });

    const vaultResponse: PatchVaultResponseBody = await results[0].json();
    return vaultResponse.vault;
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
      const errorData = await getErrorFromResponse(res);

      sendNotification({
        type: "error",
        title: `Error deleting ${getVaultName(vault)}`,
        description: `Error: ${errorData.message}`,
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
