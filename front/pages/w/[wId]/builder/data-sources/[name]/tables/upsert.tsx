import {
  Button,
  DocumentPlusIcon,
  DropdownMenu,
  ExclamationCircleIcon,
  Input,
  Page,
  TrashIcon,
} from "@dust-tt/sparkle";
import type {
  DataSourceType,
  Result,
  SubscriptionType,
  WorkspaceType,
} from "@dust-tt/types";
import { parseAndStringifyCsv } from "@dust-tt/types";
import { Err, isSlugified, Ok } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useContext, useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";

import { subNavigationBuild } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleSaveCancelTitle } from "@app/components/sparkle/AppLayoutTitle";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import config from "@app/lib/api/config";
import { getDataSource } from "@app/lib/api/data_sources";
import { handleFileUploadToText } from "@app/lib/client/handle_file_upload";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useDataSourceTable } from "@app/lib/swr/data_sources";
import { classNames } from "@app/lib/utils";
import type { UpsertTableFromCsvRequestBody } from "@app/pages/api/w/[wId]/data_sources/[name]/tables/csv";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  readOnly: boolean;
  dataSource: DataSourceType;
  loadTableId: string | null;
  gaTrackingId: string;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();

  if (!owner || !plan || !subscription || !auth.isUser()) {
    return {
      notFound: true,
    };
  }

  const dataSource = await getDataSource(auth, context.params?.name as string);
  if (!dataSource) {
    return {
      notFound: true,
    };
  }

  // If user is not builder or if datasource is managed.
  const readOnly = !auth.isBuilder() || !!dataSource.connectorId;

  return {
    props: {
      owner,
      subscription,
      readOnly,
      dataSource: dataSource.toJSON(),
      loadTableId: (context.query.tableId || null) as string | null,
      gaTrackingId: config.getGaTrackingId(),
    },
  };
});

export default function TableUpsert({
  owner,
  subscription,
  readOnly,
  dataSource,
  loadTableId,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const { mutate } = useSWRConfig();

  const sendNotification = useContext(SendNotificationsContext);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tableId, setTableId] = useState<string | null>(null);
  const [tableName, setTableName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);

  const [disabled, setDisabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [upserting, setUpserting] = useState(false);
  const [isBigFile, setIsBigFile] = useState(false);

  const { table } = useDataSourceTable({
    workspaceId: owner.sId,
    dataSourceName: dataSource.name,
    tableId: loadTableId,
  });

  useEffect(() => {
    if (!loadTableId && !file) {
      // File can be null if we are editing a table.
      return setDisabled(true);
    }
    if (!tableName || !description) {
      return setDisabled(true);
    }

    const edited =
      !loadTableId ||
      table?.name !== tableName ||
      table?.description !== description ||
      file;

    return setDisabled(!edited);
  }, [tableName, description, file, loadTableId, table]);

  useEffect(() => {
    if (loadTableId && table && !tableId) {
      setTableId(table.table_id);
      setTableName(table.name);
      setDescription(table.description);
    }
  }, [dataSource.name, loadTableId, owner.sId, table, tableId]);

  // Not empty, only alphanumeric, and not too long
  const isNameValid = (name: string) => name.trim() !== "" && isSlugified(name);

  const redirectToDataSourcePage = () => {
    void router.push(
      `/w/${owner.sId}/builder/data-sources/${dataSource.name}?tab=tables`
    );
  };

  const handleDelete = async () => {
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.name}/tables/${tableId}`,
      {
        method: "DELETE",
      }
    );

    if (!res.ok) {
      sendNotification({
        type: "error",
        title: "Error deleting table",
        description: `An error occured: ${await res.text()}.`,
      });
      return;
    }
    await mutate(`/api/w/${owner.sId}/data_sources/${dataSource.name}/tables`);
    redirectToDataSourcePage();
  };

  const handleUpsert = async () => {
    setUpserting(true);

    try {
      const fileContentRes: Result<string | null, null> = await (async () => {
        if (file) {
          const res = await handleFileUploadToText(file);
          if (res.isErr()) {
            sendNotification({
              type: "error",
              title: "Error uploading file",
              description: `An unexpected error occured: ${res.error}.`,
            });
            return new Err(null);
          }

          const { content } = res.value;
          try {
            const stringifiedContent = await parseAndStringifyCsv(content);

            return new Ok(stringifiedContent);
          } catch (err) {
            if (err instanceof Error) {
              sendNotification({
                type: "error",
                title: "Error uploading file",
                description: `Invalid headers: ${err.message}.`,
              });
              return new Err(null);
            }

            sendNotification({
              type: "error",
              title: "Error uploading file",
              description: `An error occured: ${err}.`,
            });
            return new Err(null);
          }
        }

        return new Ok(null);
      })();

      if (fileContentRes.isErr()) {
        return;
      }

      const fileContent = fileContentRes.value;

      if (fileContent && fileContent.length > 50_000_000) {
        sendNotification({
          type: "error",
          title: "File too large",
          description:
            "Please upload a file containing less than 50 million characters.",
        });
        return;
      }

      if (fileContent && fileContent.length > 5_000_000) {
        setIsBigFile(true);
      } else {
        setIsBigFile(false);
      }

      let body: UpsertTableFromCsvRequestBody;
      if (fileContent) {
        body = {
          name: tableName,
          description: description,
          csv: fileContent,
          tableId: loadTableId ?? undefined,
          timestamp: null,
          tags: [],
          parents: [],
          truncate: true,
          async: false,
          useAppForHeaderDetection: false,
        };
      } else if (tableId) {
        body = {
          name: tableName,
          description: description,
          tableId: tableId,
          timestamp: null,
          tags: [],
          parents: [],
          csv: undefined,
          truncate: false,
          async: false,
          useAppForHeaderDetection: false,
        };
      } else {
        throw new Error("Unreachable: fileContent is null");
      }

      const uploadRes = await fetch(
        `/api/w/${owner.sId}/data_sources/${dataSource.name}/tables/csv`,
        {
          method: "POST",
          body: JSON.stringify(body),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!uploadRes.ok) {
        sendNotification({
          type: "error",
          title: "Error uploading file",
          description: `An error occured: ${await uploadRes.text()}.`,
        });
        return;
      }

      if (loadTableId) {
        await mutate(
          `/api/w/${owner.sId}/data_sources/${dataSource.name}/tables/${loadTableId}`
        );
      } else {
        await mutate(
          `/api/w/${owner.sId}/data_sources/${dataSource.name}/tables`
        );
      }
      redirectToDataSourcePage();
    } finally {
      setUpserting(false);
    }
  };

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      subNavigation={subNavigationBuild({
        owner,
        current: "data_sources_static",
      })}
      titleChildren={
        <AppLayoutSimpleSaveCancelTitle
          title={loadTableId ? "Edit table" : "Add a new table"}
          onCancel={redirectToDataSourcePage}
          onSave={
            !readOnly && !disabled
              ? async () => {
                  await handleUpsert();
                }
              : undefined
          }
          isSaving={loading || uploading || upserting}
        />
      }
      hideSidebar={true}
    >
      <div className="pt-6">
        <Page.Vertical align="stretch">
          <div className="pt-4">
            <Page.SectionHeader
              title="Table name"
              description="Enter the table name. This identifier will be used in the Assistant builder to pick tables for querying."
            />
            <div className="pt-4">
              <Input
                placeholder="name_of_table"
                name="table-name"
                disabled={readOnly || !!loadTableId}
                value={tableName}
                onChange={setTableName}
                error={
                  !tableName || isNameValid(tableName)
                    ? null
                    : "Invalid name: Must be alphanumeric, max 32 characters and no space."
                }
                showErrorLabel={true}
              />
            </div>
          </div>

          <div className="pt-4">
            <Page.SectionHeader
              title="Description"
              description="Describe the content of your CSV file. It will be used by the LLM model to generate relevant queries."
            />
            <div className="pt-4">
              <textarea
                name="table-description"
                placeholder="This table contains..."
                rows={10}
                disabled={readOnly}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={classNames(
                  "font-mono text-normal block w-full min-w-0 flex-1 rounded-md",
                  "border-structure-200 bg-structure-50",
                  readOnly
                    ? "focus:border-gray-300 focus:ring-0"
                    : "focus:border-action-300 focus:ring-action-300"
                )}
              />
            </div>
          </div>

          <div className="pt-4">
            {!readOnly && (
              <>
                <Page.SectionHeader
                  title="CSV File"
                  description="Select the CSV file for data extraction. The maximum file size allowed is 50MB."
                  action={{
                    label: (() => {
                      if (uploading) {
                        return "Uploading...";
                      } else if (file) {
                        return file.name;
                      } else if (loadTableId) {
                        return "Replace file";
                      } else {
                        return "Upload file";
                      }
                    })(),
                    variant: "primary",
                    icon: DocumentPlusIcon,
                    onClick: () => {
                      if (fileInputRef.current) {
                        fileInputRef.current.click();
                      }
                    },
                  }}
                />
                {isBigFile && (
                  <div className="pt-4">
                    <div className="flex flex-col gap-y-2">
                      <div className="flex grow flex-row items-center gap-1 text-sm font-medium text-element-800 text-warning-500">
                        <ExclamationCircleIcon />
                        Warning: Large file (5MB+)
                      </div>
                      <div className="text-sm font-normal text-element-700">
                        This file is large and may take a while to upload.
                      </div>
                    </div>
                  </div>
                )}
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  accept=".csv, .tsv"
                  onChange={async (e) => {
                    setUploading(true);
                    const csvFile = e?.target?.files?.[0];
                    if (!csvFile) {
                      return;
                    }
                    if (csvFile.size > 50_000_000) {
                      sendNotification({
                        type: "error",
                        title: "File too large",
                        description: "Please upload a file smaller than 50MB.",
                      });
                      setUploading(false);
                      return;
                    }

                    if (
                      ![
                        "text/csv",
                        "text/tsv",
                        "text/comma-separated-values",
                        "text/tab-separated-values",
                      ].includes(csvFile.type)
                    ) {
                      sendNotification({
                        type: "error",
                        title: "Invalid file type",
                        description: "Please upload a CSV or TSV file.",
                      });
                      setUploading(false);
                      return;
                    }

                    setFile(csvFile);
                    setUploading(false);
                  }}
                />
              </>
            )}
          </div>

          {!readOnly && loadTableId && (
            <div className="flex py-16">
              <div className="flex">
                <DropdownMenu>
                  <DropdownMenu.Button>
                    <Button
                      variant="primaryWarning"
                      icon={TrashIcon}
                      label="Remove table"
                    />
                  </DropdownMenu.Button>
                  <DropdownMenu.Items width={280}>
                    <div className="flex flex-col gap-y-4 px-4 py-4">
                      <div className="flex flex-col gap-y-2">
                        <div className="grow text-sm font-medium text-element-800">
                          Are you sure you want to delete?
                        </div>

                        <div className="text-sm font-normal text-element-700">
                          This will delete the table for everyone.
                        </div>
                      </div>
                      <div className="flex justify-center">
                        <Button
                          variant="primaryWarning"
                          size="sm"
                          label={"Delete for Everyone"}
                          disabled={loading}
                          icon={TrashIcon}
                          onClick={async () => {
                            setLoading(true);
                            await handleDelete();
                            setLoading(false);
                          }}
                        />
                      </div>
                    </div>
                  </DropdownMenu.Items>
                </DropdownMenu>
              </div>
            </div>
          )}
        </Page.Vertical>
      </div>
    </AppLayout>
  );
}
