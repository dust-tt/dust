import {
  Avatar,
  Button,
  Cog6ToothIcon,
  ContextItem,
  createSelectionColumn,
  DataTable,
  DustLogoSquare,
  FolderIcon,
  Icon,
  Page,
  PlusIcon,
  SearchInput,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SliderToggle,
} from "@dust-tt/sparkle";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useCallback, useMemo, useState } from "react";

import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useSendNotification } from "@app/hooks/useNotification";
import { isRestrictedFromAgentCreation } from "@app/lib/auth";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import {
  getDisplayNameForDataSource,
  isRemoteDatabase,
} from "@app/lib/data_sources";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useSpaceDataSourceViews } from "@app/lib/swr/spaces";
import type {
  APIError,
  DataSourceType,
  DataSourceViewType,
  LightAgentConfigurationType,
  SpaceType,
  SubscriptionType,
  WorkspaceType,
} from "@app/types";
import { pluralize } from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  globalSpace: SpaceType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !auth.isBuilder() || !subscription) {
    return {
      notFound: true,
    };
  }

  if (await isRestrictedFromAgentCreation(owner)) {
    return {
      notFound: true,
    };
  }

  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);

  return {
    props: {
      owner,
      subscription,
      globalSpace: globalSpace.toJSON(),
    },
  };
});

function DustAgentDataSourceVisual({
  dataSourceView,
}: {
  dataSourceView: DataSourceViewType;
}) {
  const { isDark } = useTheme();

  return (
    <ContextItem.Visual
      visual={getConnectorProviderLogoWithFallback({
        provider: dataSourceView.dataSource.connectorProvider,
        isDark,
      })}
    />
  );
}

export default function EditDustAgent({
  owner,
  subscription,
  globalSpace,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const sendNotification = useSendNotification();

  const {
    agentConfigurations,
    mutateRegardlessOfQueryParams: mutateAgentConfigurations,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "global",
  });

  const {
    spaceDataSourceViews: unfilteredSpaceDataSourceViews,
    mutate: mutateDataSourceViews,
  } = useSpaceDataSourceViews({
    workspaceId: owner.sId,
    spaceId: globalSpace.sId,
    category: "managed",
  });

  // We do not support remote databases for the Dust agent at the moment.
  const spaceDataSourceViews = useMemo(
    () =>
      unfilteredSpaceDataSourceViews.filter(
        (ds) => !isRemoteDatabase(ds.dataSource)
      ),
    [unfilteredSpaceDataSourceViews]
  );

  const sortedDataSources = useMemo(
    () =>
      [...spaceDataSourceViews].sort((a, b) =>
        a.dataSource.name.localeCompare(b.dataSource.name)
      ),
    [spaceDataSourceViews]
  );

  const handleToggleAgentStatus = useCallback(
    async (agent: LightAgentConfigurationType) => {
      if (agent.status === "disabled_missing_datasource") {
        sendNotification({
          title: "Dust Agent",
          description:
            "The Dust agent requires at least one data source to be enabled.",
          type: "error",
        });
        return;
      }
      const res = await fetch(
        `/api/w/${owner.sId}/assistant/global_agents/${agent.sId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status:
              agent.status === "disabled_by_admin"
                ? "active"
                : "disabled_by_admin",
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        sendNotification({
          title: "Error",
          description: `Failed to toggle agent: ${data.error?.message ?? "unknown error"}`,
          type: "error",
        });
        return;
      }

      await mutateAgentConfigurations();
    },
    [mutateAgentConfigurations, owner.sId, sendNotification]
  );

  const updateDataSourceSettings = useCallback(
    async (
      settings: {
        assistantDefaultSelected: boolean;
      },
      dataSource: DataSourceType
    ) => {
      const res = await fetch(
        `/api/w/${owner.sId}/data_sources/${dataSource.sId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(settings),
        }
      );
      if (!res.ok) {
        const err = (await res.json()) as { error: APIError };
        sendNotification({
          title: "Update failed",
          description: `Could not update data source: ${err.error.message}`,
          type: "error",
        });
      }
      await mutateDataSourceViews();
      await mutateAgentConfigurations();
    },
    [
      mutateAgentConfigurations,
      mutateDataSourceViews,
      owner.sId,
      sendNotification,
    ]
  );

  const dustAgentConfiguration = agentConfigurations?.find(
    (c) => c.name === "dust"
  );
  if (!dustAgentConfiguration) {
    return null;
  }

  return (
    <AppCenteredLayout
      subscription={subscription}
      hideSidebar
      owner={owner}
      title={
        <AppLayoutSimpleCloseTitle
          title="Manage Dust Agent"
          onClose={async () => {
            await router.push(`/w/${owner.sId}/builder/agents`);
          }}
        />
      }
    >
      <Page.Header
        title="Dust Agent"
        icon={DustLogoSquare}
        description="The Dust agent is a general purpose agent that has context on your company data."
      />
      <div className="flex flex-col space-y-8 pb-8 pt-8">
        <div className="flex w-full flex-col gap-4">
          {spaceDataSourceViews.length > 0 && (
            <>
              <Page.SectionHeader
                title="Availability"
                description="The Dust agent requires at least one data source to be enabled."
              />

              <ContextItem
                title="Enable the Dust agent for this workspace."
                visual={
                  <Avatar
                    visual="https://dust.tt/static/systemavatar/dust_avatar_full.png"
                    size="xs"
                  />
                }
                action={
                  <SliderToggle
                    selected={dustAgentConfiguration?.status === "active"}
                    onClick={async () => {
                      await handleToggleAgentStatus(dustAgentConfiguration);
                    }}
                    disabled={
                      dustAgentConfiguration?.status ===
                      "disabled_free_workspace"
                    }
                  />
                }
              />
            </>
          )}
          {spaceDataSourceViews.length > 0 &&
          dustAgentConfiguration?.status !== "disabled_by_admin" ? (
            <>
              <Page.SectionHeader
                title="Data Sources and Connections"
                description="Configure which Company Data connections and data sources will be searched by the Dust agent."
              />
              <ContextItem.List>
                {sortedDataSources.map((dsView) => (
                  <ContextItem
                    key={dsView.id}
                    title={getDisplayNameForDataSource(dsView.dataSource)}
                    visual={
                      <DustAgentDataSourceVisual dataSourceView={dsView} />
                    }
                    action={
                      <SliderToggle
                        selected={dsView.dataSource.assistantDefaultSelected}
                        onClick={async () => {
                          await updateDataSourceSettings(
                            {
                              assistantDefaultSelected:
                                !dsView.dataSource.assistantDefaultSelected,
                            },
                            dsView.dataSource
                          );
                        }}
                      />
                    }
                  />
                ))}
                <ContextItem
                  title="Websites"
                  visual={
                    <ContextItem.Visual
                      visual={getConnectorProviderLogoWithFallback({
                        provider: "webcrawler",
                      })}
                    />
                  }
                  action={
                    <DataSourceCategorySheet
                      owner={owner}
                      spaceId={globalSpace.sId}
                      category="website"
                      title="Websites"
                      trigger={
                        <Button icon={Cog6ToothIcon} variant="outline" />
                      }
                      updateDataSourceSettings={updateDataSourceSettings}
                    />
                  }
                />
                <ContextItem
                  title="Folders"
                  visual={
                    <ContextItem.Visual
                      visual={getConnectorProviderLogoWithFallback({
                        provider: null,
                      })}
                    />
                  }
                  action={
                    <DataSourceCategorySheet
                      owner={owner}
                      spaceId={globalSpace.sId}
                      category="folder"
                      title="Folders"
                      trigger={
                        <Button icon={Cog6ToothIcon} variant="outline" />
                      }
                      updateDataSourceSettings={updateDataSourceSettings}
                    />
                  }
                />
              </ContextItem.List>
            </>
          ) : dustAgentConfiguration?.status ===
            "disabled_missing_datasource" ? (
            <Page.SectionHeader
              title="This workspace doesn't currently have any data sources."
              description="Add Company Data connections or data sources to enable the Dust agent."
              action={{
                label: "Add data",
                variant: "primary",
                icon: PlusIcon,
                onClick: async () => {
                  await router.push(
                    `/w/${owner.sId}/spaces/${globalSpace.sId}`
                  );
                },
              }}
            />
          ) : null}
        </div>
      </div>
    </AppCenteredLayout>
  );
}

EditDustAgent.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};

function DataSourceCategorySheet({
  owner,
  spaceId,
  category,
  title,
  trigger,
  updateDataSourceSettings,
}: {
  owner: WorkspaceType;
  spaceId: string;
  category: "website" | "folder";
  title: string;
  trigger: React.ReactNode;
  updateDataSourceSettings: (
    settings: { assistantDefaultSelected: boolean },
    dataSource: DataSourceType
  ) => Promise<void>;
}) {
  const { spaceDataSourceViews } = useSpaceDataSourceViews({
    workspaceId: owner.sId,
    spaceId,
    category,
  });

  const [search, setSearch] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isSaving, setIsSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const sendNotification = useSendNotification();

  type Data = {
    name: string;
    id: string;
    dataSourceView: DataSourceViewType;
    onClick?: () => void;
  };

  const rows: Data[] = useMemo(() => {
    const query = search.trim().toLowerCase();
    return spaceDataSourceViews
      .map((dsv) => ({
        id: dsv.sId,
        name: getDisplayNameForDataSource(dsv.dataSource),
        dataSourceView: dsv,
      }))
      .filter((r) => (query ? r.name.toLowerCase().includes(query) : true));
  }, [spaceDataSourceViews, search]);

  const computeInitialSelection = useMemo(() => {
    const initial: RowSelectionState = {};
    for (const v of spaceDataSourceViews) {
      if (v.dataSource.assistantDefaultSelected) {
        initial[v.sId] = true;
      }
    }
    return initial;
  }, [spaceDataSourceViews]);

  const columnsWithSelection: ColumnDef<Data>[] = useMemo(
    () => [
      createSelectionColumn<Data>(),
      {
        header: "Name",
        accessorKey: "name",
        cell: (info) => (
          <DataTable.CellContent>
            {info.row.original.name}
          </DataTable.CellContent>
        ),
      },
    ],
    []
  );

  const onClose = () => {
    setRowSelection({});
    setSearch("");
  };

  const onSave = async (): Promise<boolean> => {
    setIsSaving(true);
    try {
      const selectedIds = new Set(
        Object.keys(rowSelection).filter((k) => rowSelection[k])
      );

      const changes = spaceDataSourceViews.filter(
        (v) => v.dataSource.assistantDefaultSelected !== selectedIds.has(v.sId)
      );

      if (changes.length === 0) {
        sendNotification({
          title: "No changes",
          description: "Your selection already matches current settings.",
          type: "info",
        });
        return true;
      }

      await Promise.all(
        changes.map((v) =>
          updateDataSourceSettings(
            { assistantDefaultSelected: selectedIds.has(v.sId) },
            v.dataSource
          )
        )
      );

      sendNotification({
        title: "Saved",
        description: `Updated ${changes.length} data source${pluralize(changes.length)}`,
        type: "success",
      });
      setRowSelection({});
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      sendNotification({
        title: "Save failed",
        description: message,
        type: "error",
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(open) => {
        setOpen(open);
        if (open) {
          setRowSelection(computeInitialSelection);
        } else {
          onClose();
        }
      }}
    >
      <div className="inline-flex">
        <SheetTrigger asChild>{trigger}</SheetTrigger>
      </div>
      <SheetContent size="lg">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Avatar visual={<Icon visual={FolderIcon} />} size="md" />
            <div>
              <SheetTitle>{title}</SheetTitle>
            </div>
          </div>
        </SheetHeader>
        <SheetContainer>
          <div className="flex flex-col gap-4">
            <SearchInput
              value={search}
              onChange={setSearch}
              name={`search-${category}`}
              placeholder={`Search ${title.toLowerCase()}...`}
            />
            <DataTable
              data={rows}
              columns={columnsWithSelection}
              rowSelection={rowSelection}
              enableRowSelection
              setRowSelection={setRowSelection}
              getRowId={(row) => row.id}
            />
          </div>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: isSaving ? "Saving..." : "Save",
            variant: "primary",
            onClick: isSaving
              ? undefined
              : async () => {
                  const ok = await onSave();
                  if (ok) {
                    setOpen(false);
                  }
                },
            disabled: isSaving,
            loading: isSaving,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
