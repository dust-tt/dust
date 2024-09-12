import {
  Button,
  DocumentPlusIcon,
  DropdownMenu,
  EyeIcon,
  EyeSlashIcon,
  Input,
  Page,
  PlusIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import type {
  DataSourceType,
  PostDataSourceDocumentRequestBody,
  WorkspaceType,
} from "@dust-tt/types";
import type { PlanType, SubscriptionType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useContext, useEffect, useRef, useState } from "react";

import { subNavigationBuild } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleSaveCancelTitle } from "@app/components/sparkle/AppLayoutTitle";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { getDataSource } from "@app/lib/api/data_sources";
import { handleFileUploadToText } from "@app/lib/client/handle_file_upload";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { classNames } from "@app/lib/utils";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  plan: PlanType;
  readOnly: boolean;
  dataSource: DataSourceType;
  loadDocumentId: string | null;
}>(async (context, auth) => {
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
      owner,
      plan,
      subscription,
      readOnly,
      dataSource: dataSource.toJSON(),
      loadDocumentId: (context.query.documentId || null) as string | null,
    },
  };
});

export default function DatasourceUpsert({
  owner,
  subscription,
  plan,
  readOnly,
  dataSource,
  loadDocumentId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documentId, setDocumentId] = useState("");
  const [text, setText] = useState("");
  const [tags, setTags] = useState([] as string[]);
  const [sourceUrl, setSourceUrl] = useState("");

  const [disabled, setDisabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [developerOptionsVisible, setDeveloperOptionsVisible] = useState(false);

  const sendNotification = useContext(SendNotificationsContext);

  useEffect(() => {
    setDisabled(!documentId || !text);
  }, [documentId, text]);

  useEffect(() => {
    if (loadDocumentId) {
      setDocumentId(loadDocumentId);
      setDownloading(true);
      setDisabled(true);
      fetch(
        `/api/w/${owner.sId}/data_sources/${
          dataSource.name
        }/documents/${encodeURIComponent(loadDocumentId)}`
      )
        .then(async (res) => {
          if (res.ok) {
            const document = await res.json();
            setDisabled(false);
            setDownloading(false);
            setText(document.document.text);
            setTags(document.document.tags);
            setSourceUrl(document.document.source_url);
          }
        })
        .catch((e) => console.error(e));
    }
  }, [dataSource.name, loadDocumentId, owner.sId]);

  const router = useRouter();

  const handleUpsert = async () => {
    setLoading(true);

    const body: PostDataSourceDocumentRequestBody = {
      timestamp: null,
      parents: null,
      section: {
        prefix: null,
        content: text,
        sections: [],
      },
      text: null,
      source_url: sourceUrl || undefined,
      tags: tags.filter((tag) => tag),
      light_document_output: true,
      upsert_context: null,
      async: false,
    };

    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${
        dataSource.name
      }/documents/${encodeURIComponent(documentId)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (res.ok) {
      await router.push(
        `/w/${owner.sId}/builder/data-sources/${dataSource.name}`
      );
    } else {
      let errMsg = "";
      try {
        const data = await res.json();
        errMsg = data.error.message;
      } catch (e) {
        errMsg = "An error occurred while uploading your document.";
      }

      sendNotification({
        type: "error",
        title: "Error upserting document",
        description: errMsg,
      });
      setLoading(false);
    }
  };

  const handleTagUpdate = (index: number, value: string) => {
    const newTags = [...tags];
    newTags[index] = value;
    setTags(newTags);
  };

  const handleAddTag = () => {
    setTags([...tags, ""]);
  };

  const handleTagDelete = (index: number) => {
    const newTags = [...tags];
    newTags.splice(index, 1);
    setTags(newTags);
  };

  const handleDelete = async () => {
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${
        dataSource.name
      }/documents/${encodeURIComponent(documentId)}`,
      {
        method: "DELETE",
      }
    );

    if (!res.ok) {
      alert("There was an error deleting the document.");
      return;
    }
    await router.push(
      `/w/${owner.sId}/builder/data-sources/${dataSource.name}`
    );
  };

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      subNavigation={subNavigationBuild({
        owner,
        current: "data_sources_static",
      })}
      titleChildren={
        <AppLayoutSimpleSaveCancelTitle
          title={loadDocumentId ? "Edit document" : "Add a new document"}
          onCancel={() => {
            void router.push(
              `/w/${owner.sId}/builder/data-sources/${dataSource.name}`
            );
          }}
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
            <Page.SectionHeader title="Document title" />
            <div className="pt-4">
              <Input
                placeholder="Document title"
                name="document"
                disabled={readOnly || !!loadDocumentId}
                value={documentId}
                onChange={(v) => setDocumentId(v)}
              />
            </div>
          </div>

          <div className="pt-4">
            <Page.SectionHeader
              title="Associated URL"
              description="The URL of the associated document (if any). Will be used to link users to the original document in assistants citations."
            />
            <div className="pt-4">
              <Input
                placeholder="https://..."
                name="document"
                disabled={readOnly}
                value={sourceUrl}
                onChange={(v) => setSourceUrl(v)}
              />
            </div>
          </div>

          <div className="pt-4">
            {!readOnly && (
              <input
                className="hidden"
                type="file"
                accept=".txt, .pdf, .md, .csv"
                ref={fileInputRef}
                onChange={async (e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    setUploading(true);
                    const res = await handleFileUploadToText(e.target.files[0]);
                    setUploading(false);
                    if (res.isErr()) {
                      sendNotification({
                        type: "error",
                        title: "Error uploading file.",
                        description: res.error.message,
                      });
                      return;
                    }
                    if (
                      plan.limits.dataSources.documents.sizeMb != -1 &&
                      res.value.content.length >
                        1024 * 1024 * plan.limits.dataSources.documents.sizeMb
                    ) {
                      sendNotification({
                        type: "error",
                        title: "Upload size limit",
                        description:
                          `Data Source document upload size is limited to ` +
                          `${plan.limits.dataSources.documents.sizeMb}MB (of raw text) ` +
                          `Contact support@dust.tt if you want to increase this limit.`,
                      });
                      return;
                    }
                    setText(res.value.content);
                  }
                }}
              ></input>
            )}
            <Page.SectionHeader
              title="Text content"
              description={`Copy paste content or upload a file (text or PDF). Up to ${
                plan.limits.dataSources.documents.sizeMb == -1
                  ? "2"
                  : plan.limits.dataSources.documents.sizeMb
              } MB of raw text.`}
              action={{
                label: uploading ? "Uploading..." : "Upload file",
                variant: "secondary",
                icon: DocumentPlusIcon,
                onClick: () => {
                  if (fileInputRef.current) {
                    fileInputRef.current.click();
                  }
                },
              }}
            />
            <div className="pt-4">
              <textarea
                name="text"
                id="text"
                rows={20}
                readOnly={readOnly}
                className={classNames(
                  "font-mono text-normal block w-full min-w-0 flex-1 rounded-md",
                  "border-structure-200 bg-structure-50",
                  readOnly
                    ? "focus:border-gray-300 focus:ring-0"
                    : "focus:border-action-300 focus:ring-action-300",
                  downloading ? "text-element-600" : "text-element-900"
                )}
                disabled={downloading}
                value={
                  downloading
                    ? "Downloading..."
                    : uploading
                      ? "Uploading..."
                      : text
                }
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          </div>
          <div className="pt-4">
            <Page.SectionHeader
              title="Developer Options"
              action={{
                label: developerOptionsVisible ? "Hide" : "Show",
                variant: "tertiary",
                icon: developerOptionsVisible ? EyeSlashIcon : EyeIcon,
                onClick: () => {
                  setDeveloperOptionsVisible(!developerOptionsVisible);
                },
              }}
            />
          </div>

          {developerOptionsVisible && (
            <div className="pt-4">
              <Page.SectionHeader
                title=""
                description="Tags can be set to filter Data Source retrieval or provide a user-friendly title for programmatically uploaded documents (`title:User-friendly Title`)."
                action={{
                  label: "Add tag",
                  variant: "tertiary",
                  icon: PlusIcon,
                  onClick: () => handleAddTag(),
                }}
              />
              <div className="pt-4">
                {tags.map((tag, index) => (
                  <div key={index} className="flex flex-grow flex-row">
                    <div className="flex flex-1 flex-row gap-8">
                      <div className="flex flex-1 flex-col">
                        <Input
                          className="w-full"
                          placeholder="Tag"
                          name="tag"
                          disabled={readOnly}
                          value={tag}
                          onChange={(v) => handleTagUpdate(index, v)}
                        />
                      </div>
                      <div className="flex">
                        <Button
                          label="Remove"
                          icon={TrashIcon}
                          variant="secondaryWarning"
                          onClick={() => handleTagDelete(index)}
                          labelVisible={false}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!readOnly && loadDocumentId && (
            <div className="flex py-16">
              <div className="flex">
                <DropdownMenu>
                  <DropdownMenu.Button>
                    <Button
                      variant="primaryWarning"
                      icon={TrashIcon}
                      label={"Remove document"}
                    />
                  </DropdownMenu.Button>
                  <DropdownMenu.Items width={280}>
                    <div className="flex flex-col gap-y-4 px-4 py-4">
                      <div className="flex flex-col gap-y-2">
                        <div className="grow text-sm font-medium text-element-800">
                          Are you sure you want to delete?
                        </div>

                        <div className="text-sm font-normal text-element-700">
                          This will delete the Document for everyone.
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
