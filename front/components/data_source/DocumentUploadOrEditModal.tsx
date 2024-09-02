import {
  Button,
  DocumentPlusIcon,
  EyeIcon,
  EyeSlashIcon,
  Input,
  Modal,
  Page,
  PlusIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  LightContentNode,
  LightWorkspaceType,
  PlanType,
  PostDataSourceDocumentRequestBody,
} from "@dust-tt/types";
import { useContext, useEffect, useRef, useState } from "react";

import { DocumentLimitPopup } from "@app/components/data_source/DocumentLimitPopup";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { handleFileUploadToText } from "@app/lib/client/handle_file_upload";
import { classNames } from "@app/lib/utils";

export interface DocumentUploadOrEditModalProps {
  dataSourceView: DataSourceViewType;
  contentNode?: LightContentNode;
  isOpen: boolean;
  onClose: (save: boolean) => void;
  owner: LightWorkspaceType;
  plan: PlanType;
}

export function DocumentUploadOrEditModal({
  dataSourceView,
  contentNode,
  isOpen,
  onClose,
  owner,
  plan,
}: DocumentUploadOrEditModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documentId, setDocumentId] = useState("");
  const [text, setText] = useState("");
  const [tags, setTags] = useState([] as string[]);
  const [sourceUrl, setSourceUrl] = useState("");

  const [disabled, setDisabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [developerOptionsVisible, setDeveloperOptionsVisible] = useState(false);

  const sendNotification = useContext(SendNotificationsContext);
  const documentIdToLoad = contentNode?.internalId;

  useEffect(() => {
    setDisabled(!documentId || !text);
  }, [documentId, text]);

  useEffect(() => {
    if (documentIdToLoad) {
      setDocumentId(documentIdToLoad);
      setDisabled(true);
      fetch(
        `/api/w/${owner.sId}/data_sources/${
          dataSourceView.dataSource.name
        }/documents/${encodeURIComponent(documentIdToLoad)}`
      )
        .then(async (res) => {
          if (res.ok) {
            const document = await res.json();
            setDisabled(false);
            setText(document.document.text);
            setTags(document.document.tags);
            setSourceUrl(document.document.source_url);
          }
        })
        .catch((e) => console.error(e));
    } else {
      setDocumentId("");
      setText("");
      setTags([]);
      setSourceUrl("");
    }
  }, [dataSourceView.dataSource.name, documentIdToLoad, owner.sId]);

  //TODO(GROUPS_UI) Get the total number of documents
  const total = 0;

  if (
    !documentIdToLoad && // If there is no document ID, it means we are creating a new document
    plan.limits.dataSources.documents.count != -1 &&
    total >= plan.limits.dataSources.documents.count
  ) {
    return (
      <DocumentLimitPopup
        isOpen={isOpen}
        plan={plan}
        onClose={() => onClose(false)}
        owner={owner}
      />
    );
  }

  const handleUpsert = async () => {
    setLoading(true);

    const body: PostDataSourceDocumentRequestBody = {
      timestamp: null,
      parents: null,
      section: {
        prefix: null,
        content: text ?? null,
        sections: [],
      },
      text: null,
      source_url: sourceUrl || undefined,
      tags: tags.filter((tag) => tag),
      light_document_output: true,
      upsert_context: null,
      async: false,
    };

    try {
      // TODO replace endpoint https://github.com/dust-tt/dust/issues/6921
      const res = await fetch(
        `/api/w/${owner.sId}/data_sources/${
          dataSourceView.dataSource.name
        }/documents/${encodeURIComponent(documentId)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        throw new Error("Failed to upsert document");
      }
      sendNotification({
        type: "success",
        title: "Document successfully added",
        description: `Your document ${documentId} was successfully added`,
      });
      onClose(true);
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Error upserting document",
        description: "An error occurred while uploading your document.",
      });
    } finally {
      setLoading(false);
    }
  };

  const readOnly = false;

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

  const hasChanged = !!documentId && !!text;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => onClose(false)}
      hasChanged={hasChanged}
      variant="side-md"
      onSave={
        !disabled
          ? async () => {
              await handleUpsert();
            }
          : undefined
      }
      isSaving={loading}
      title={contentNode?.internalId ? "Edit document" : "Add a new document"}
    >
      <Page.Vertical align="stretch">
        <div className="ml-2 mr-2 space-y-2">
          <div className="pt-4">
            <Page.SectionHeader title="Document title" />
            <div className="pt-4">
              <Input
                placeholder="Document title"
                name="document"
                disabled={readOnly}
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
            />
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
            <div className="mt-2">
              <textarea
                id="text"
                name="text"
                rows={10}
                className={classNames(
                  "font-mono text-normal block w-full min-w-0 flex-1 rounded-md",
                  "border-structure-200 bg-structure-50",
                  readOnly
                    ? "focus:border-gray-300 focus:ring-0"
                    : "focus:border-action-300 focus:ring-action-300"
                )}
                value={uploading ? "Uploading..." : text}
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
        </div>
      </Page.Vertical>
    </Modal>
  );
}
