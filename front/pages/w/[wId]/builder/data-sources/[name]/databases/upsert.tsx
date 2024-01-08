import {
  Button,
  DocumentPlusIcon,
  DropdownMenu,
  Input,
  Page,
  TrashIcon,
} from "@dust-tt/sparkle";
import { DataSourceType, UserType, WorkspaceType } from "@dust-tt/types";
import { SubscriptionType } from "@dust-tt/types";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useContext, useEffect, useRef, useState } from "react";
import { mutate } from "swr";

import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleSaveCancelTitle } from "@app/components/sparkle/AppLayoutTitle";
import { subNavigationAssistants } from "@app/components/sparkle/navigation";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { handleFileUploadToText } from "@app/lib/client/handle_file_upload";
import { classNames } from "@app/lib/utils";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  readOnly: boolean;
  dataSource: DataSourceType;
  loadDatabaseId: string | null;
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();
  if (!owner || !plan || !subscription) {
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
      user,
      owner,
      subscription,
      readOnly,
      dataSource,
      loadDatabaseId: (context.query.databaseId || null) as string | null,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function DatabaseUpsert({
  user,
  owner,
  subscription,
  readOnly,
  dataSource,
  loadDatabaseId,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const sendNotification = useContext(SendNotificationsContext);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [databaseId, setDatabaseId] = useState(null);
  const [databaseName, setDatabaseName] = useState("");
  const [tableName, setTableName] = useState("");
  const [tableDescription, setTableDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [disabled, setDisabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setDisabled(!databaseName || !tableName || !tableDescription || !file);
  }, [databaseName, tableName, tableDescription, file]);

  useEffect(() => {
    if (loadDatabaseId) {
      setDatabaseName(loadDatabaseId);
      setDisabled(true);
      fetch(
        `/api/w/${owner.sId}/data_sources/${
          dataSource.name
        }/databases/${encodeURIComponent(loadDatabaseId)}/tables`
      )
        .then(async (res) => {
          if (res.ok) {
            const { database, tables } = await res.json();
            const table = tables[0]; // TODO: support multiple tables
            setDisabled(false);
            setDatabaseId(database.database_id);
            setDatabaseName(database.name);
            setTableName(table.name);
            setTableDescription(table.description);
          }
        })
        .catch((e) => console.error(e));
    }
  }, [dataSource.name, loadDatabaseId, owner.sId]);

  // Not empty, only alphanumeric, and not too long
  const isNameValid = (name: string) =>
    name !== "" && /^[a-zA-Z0-9_]{1,32}$/.test(name);

  const redirectToDataSourcePage = () => {
    void router.push(
      `/w/${owner.sId}/builder/data-sources/${dataSource.name}?tab=databases`
    );
  };

  const handleDelete = async () => {
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.name}/databases/${databaseId}`,
      {
        method: "DELETE",
      }
    );

    if (!res.ok) {
      sendNotification({
        type: "error",
        title: "Error deleting database",
        description: `An error occured: ${await res.text()}.`,
      });
      return;
    }
    await mutate(
      `/api/w/${owner.sId}/data_sources/${dataSource.name}/databases?offset=0&limit=100`
    );
    redirectToDataSourcePage();
  };

  const handleUpsert = async () => {
    if (!file) {
      return;
    }

    const res = await handleFileUploadToText(file);
    if (res.isErr()) {
      sendNotification({
        type: "error",
        title: "Error uploading file",
        description: `An unexpected error occured: ${res.error}.`,
      });
      return;
    }

    const { content } = res.value;
    if (res.value.content.length > 10_000_000) {
      sendNotification({
        type: "error",
        title: "File too large",
        description:
          "Please upload a file containing less than 10 million characters.",
      });
      return;
    }

    const uploadRes = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.name}/databases/csv`,
      {
        method: "POST",
        body: JSON.stringify({
          databaseName,
          tableName,
          tableDescription,
          csv: content,
        }),
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

    await mutate(
      `/api/w/${owner.sId}/data_sources/${dataSource.name}/databases?offset=0&limit=100`
    );
    redirectToDataSourcePage();
  };

  return (
    <AppLayout
      subscription={subscription}
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="assistants"
      subNavigation={subNavigationAssistants({
        owner,
        current: "data_sources_static",
      })}
      titleChildren={
        <AppLayoutSimpleSaveCancelTitle
          title={loadDatabaseId ? "Edit database" : "Add a new database"}
          onCancel={redirectToDataSourcePage}
          onSave={
            !readOnly && !disabled
              ? async () => {
                  await handleUpsert();
                }
              : undefined
          }
          isSaving={loading}
        />
      }
      hideSidebar={true}
    >
      <div className="pt-6">
        <Page.Vertical align="stretch">
          <div className="pt-4">
            <Page.SectionHeader
              title="Database name"
              description="Enter the database name. This identifier will be used in the Assistant builder to choose the specific database for querying."
            />
            <div className="pt-4">
              <Input
                placeholder="name_of_database"
                name="database-name"
                disabled={readOnly || !!loadDatabaseId}
                value={databaseName}
                onChange={(v) => setDatabaseName(v)}
                error={
                  !databaseName || isNameValid(databaseName)
                    ? null
                    : "Invalid name: Must be alphanumeric, max 32 characters and no space."
                }
                showErrorLabel={true}
              />
            </div>
          </div>

          <div className="pt-4">
            <Page.SectionHeader
              title="Table Name"
              description="We will generate a table by extracting data from your CSV file and name it accordingly."
            />
            <div className="pt-4">
              <Input
                placeholder="name_of_table"
                name="table-name"
                disabled={readOnly || !!loadDatabaseId}
                value={tableName}
                onChange={(v) => setTableName(v)}
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
              title="Table Description"
              description="Describe the content of your CSV file. It will be used by the LLM model to generate relevant queries."
            />
            <div className="pt-4">
              <textarea
                name="table-description"
                placeholder="This table contains..."
                rows={10}
                disabled={readOnly || !!loadDatabaseId}
                value={tableDescription}
                onChange={(e) => setTableDescription(e.target.value)}
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
            {!readOnly && !loadDatabaseId && (
              <>
                <Page.SectionHeader
                  title="CSV File"
                  description="Select the CSV file for data extraction. The maximum file size allowed is 5MB."
                  action={{
                    label: uploading
                      ? "Uploading..."
                      : file
                      ? file.name
                      : "Upload file",
                    variant: "primary",
                    icon: DocumentPlusIcon,
                    onClick: () => {
                      if (fileInputRef.current) {
                        fileInputRef.current.click();
                      }
                    },
                  }}
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  accept=".csv, .tsv"
                  onChange={async (e) => {
                    setUploading(true);
                    const csvFile = e?.target?.files?.[0];
                    if (!csvFile) return;
                    if (csvFile.size > 5000000) {
                      // TODO handle ?
                      sendNotification({
                        type: "error",
                        title: "File too large",
                        description: "Please upload a file smaller than 5MB.",
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

          {!readOnly && loadDatabaseId && (
            <div className="flex py-16">
              <div className="flex">
                <DropdownMenu>
                  <DropdownMenu.Button>
                    <Button
                      variant="primaryWarning"
                      icon={TrashIcon}
                      label="Remove database"
                    />
                  </DropdownMenu.Button>
                  <DropdownMenu.Items width={280}>
                    <div className="flex flex-col gap-y-4 px-4 py-4">
                      <div className="flex flex-col gap-y-2">
                        <div className="grow text-sm font-medium text-element-800">
                          Are you sure you want to delete?
                        </div>

                        <div className="text-sm font-normal text-element-700">
                          This will delete the Database with all tables for
                          everyone.
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
