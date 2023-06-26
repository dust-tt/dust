import {
  ArrowUpOnSquareStackIcon,
  MinusCircleIcon,
  PlusSmallIcon,
} from "@heroicons/react/24/outline";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
// @ts-expect-error: type package doesn't load properly because of how we are loading pdfjs
import * as PDFJS from "pdfjs-dist/build/pdf";
import { useEffect, useRef, useState } from "react";
PDFJS.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS.version}/pdf.worker.min.js`;

import AppLayout from "@app/components/AppLayout";
import { ActionButton, Button } from "@app/components/Button";
import MainTab from "@app/components/data_source/MainTab";
import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { classNames } from "@app/lib/utils";
import { DataSourceType } from "@app/types/data_source";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  readOnly: boolean;
  dataSource: DataSourceType;
  loadDocumentId: string | null;
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
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

  // if user is not builder or if datasource is managed
  const readOnly =
    (!auth.isBuilder() && !dataSource.userUpsertable) ||
    !!dataSource.connectorId;

  return {
    props: {
      user,
      owner,
      readOnly,
      dataSource,
      loadDocumentId: (context.query.documentId || null) as string | null,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function DataSourceUpsert({
  user,
  owner,
  readOnly,
  dataSource,
  loadDocumentId,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documentId, setDocumentId] = useState("");
  const [text, setText] = useState("");
  const [tags, setTags] = useState([] as string[]);

  const [disabled, setDisabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);

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
          }
        })
        .catch((e) => console.error(e));
    }
  }, [loadDocumentId]);

  const handleFileLoadedText = (e: any) => {
    const content = e.target.result;
    setText(content);
    setUploading(false);
  };

  const handleFileLoadedPDF = async (e: any) => {
    const arrayBuffer = e.target.result;
    const loadingTask = PDFJS.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let text = "";
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const strings = content.items.map((item: any) => item.str);
      text += strings.join(" ") + "\n";
    }
    setText(text);
    setUploading(false);
  };

  const handleFileUpload = async (file: File) => {
    // Enforce plan limits: DataSource documents size.
    if (
      owner.plan.limits.dataSources.documents.sizeMb != -1 &&
      file.size > 1024 * 1024 * owner.plan.limits.dataSources.documents.sizeMb
    ) {
      window.alert(
        "DataSource document upload size is limited to 1MB on our free plan. Contact team@dust.tt if you want to increase this limit."
      );
      return;
    }
    setUploading(true);
    if (file.type == "application/pdf") {
      const fileReader = new FileReader();
      fileReader.onloadend = handleFileLoadedPDF;
      fileReader.readAsArrayBuffer(file);
    } else if (file.type == "text/plain") {
      const fileData = new FileReader();
      fileData.onloadend = handleFileLoadedText;
      fileData.readAsText(file);
    } else {
      window.alert("File type not supported.");
    }
  };

  const router = useRouter();

  const handleUpsert = async () => {
    setLoading(true);
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${
        dataSource.name
      }/documents/${encodeURIComponent(documentId)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          tags: tags.filter((tag) => tag),
        }),
      }
    );

    if (res.ok) {
      await router.push(`/w/${owner.sId}/ds/${dataSource.name}`);
    } else {
      const data = await res.json();
      console.log("UPSERT Error", data.error);
      window.alert(`Error upserting document: ${data.error.message}`);
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

  return (
    <AppLayout
      user={user}
      owner={owner}
      dataSource={dataSource}
      gaTrackingId={gaTrackingId}
    >
      <div className="flex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab
            currentTab="Documents"
            owner={owner}
            dataSource={dataSource}
          />
        </div>

        <div className="mx-auto mt-2 max-w-4xl space-y-6 divide-y divide-gray-200 px-4">
          <div>
            <div className="flex flex-1">
              <div className="w-full">
                <div className="mt-4 space-y-6 divide-y divide-gray-200"></div>

                <div className="mt-2 grid gap-x-4 gap-y-4 sm:grid-cols-5">
                  <div className="sm:col-span-5">
                    <label
                      htmlFor="documentId"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Document ID
                    </label>
                    <div className="mt-1 flex rounded-md shadow-sm">
                      <input
                        type="text"
                        name="document"
                        id="document"
                        readOnly={readOnly}
                        className={classNames(
                          "block w-full min-w-0 flex-1 rounded-md border-gray-300 text-sm",
                          "border-gray-300",
                          readOnly
                            ? "focus:border-gray-300 focus:ring-0"
                            : "focus:border-violet-500 focus:ring-violet-500"
                        )}
                        value={documentId}
                        onChange={(e) => setDocumentId(e.target.value)}
                      />
                    </div>
                    <p className="my-2 text-sm text-gray-500">
                      The ID of the document (it can be anything such as a file
                      name or title). Upserting with the ID of a document that
                      already exists will replace it.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-1">
              <div className="mb-8 w-full">
                <div className="space-y-6 divide-y divide-gray-200"></div>

                <div className="mt-2 grid grid-cols-5 gap-x-4 gap-y-4">
                  <div className="col-span-3">
                    <label
                      htmlFor="tags"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Tags
                    </label>
                    {tags.map((tag, index) => (
                      <div
                        key={index}
                        className="group mt-1 flex rounded-md shadow-sm"
                      >
                        <input
                          type="text"
                          name="document"
                          id="document"
                          readOnly={readOnly}
                          className={classNames(
                            "block w-full min-w-0 flex-1 rounded-md text-sm",
                            "border-gray-300",
                            readOnly
                              ? "focus:border-gray-300 focus:ring-0"
                              : "focus:border-violet-500 focus:ring-violet-500"
                          )}
                          value={tag}
                          onChange={(e) =>
                            handleTagUpdate(index, e.target.value)
                          }
                        />
                        {!readOnly ? (
                          <div
                            className="cursor-pointer pl-1 pt-2 group-hover:visible"
                            onClick={() => {
                              handleTagDelete(index);
                            }}
                          >
                            <MinusCircleIcon className="h-5 w-5 text-gray-400" />
                          </div>
                        ) : null}
                      </div>
                    ))}
                    {!readOnly ? (
                      <div className="mt-2 flex flex-row">
                        <div
                          className="cursor-pointer rounded bg-gray-700"
                          onClick={() => {
                            handleAddTag();
                          }}
                        >
                          <PlusSmallIcon className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex flex-1"></div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-1">
              <div className="w-full">
                <div className="sm:col-span-5">
                  <div className="flex flex-row items-center">
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-gray-700">
                        Text Content
                      </h3>
                      <p className="my-2 text-sm text-gray-500">
                        Upload (text or PDF) or copy the text data for the
                        document you want to create or replace (upsert).
                      </p>
                    </div>
                    {!readOnly ? (
                      <div className="ml-2 mt-0 flex-initial">
                        <input
                          className="hidden"
                          type="file"
                          accept=".txt, .pdf, .md"
                          ref={fileInputRef}
                          onChange={async (e) => {
                            if (e.target.files && e.target.files.length > 0) {
                              await handleFileUpload(e.target.files[0]);
                            }
                          }}
                        ></input>
                        <Button
                          onClick={() => {
                            if (fileInputRef.current) {
                              fileInputRef.current.click();
                            }
                          }}
                          disabled={readOnly || uploading}
                        >
                          <ArrowUpOnSquareStackIcon className="-ml-1 mr-1 h-5 w-5" />
                          Upload{uploading && <span>ing...</span>}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-1 flex rounded-md shadow-sm">
                    <textarea
                      name="text"
                      id="text"
                      rows={20}
                      readOnly={readOnly}
                      className={classNames(
                        "font-mono block w-full min-w-0 flex-1 rounded-md text-xs",
                        "border-gray-300",
                        readOnly
                          ? "focus:border-gray-300 focus:ring-0"
                          : "focus:border-violet-500 focus:ring-violet-500",
                        downloading ? "text-gray-300" : ""
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
              </div>
            </div>
          </div>
          {!readOnly ? (
            <div className="flex flex-row pt-6">
              <div className="flex-initial">
                <ActionButton
                  disabled={disabled || loading || readOnly}
                  onClick={async () => {
                    await handleUpsert();
                  }}
                >
                  {loading ? "Embeding..." : "Upsert"}
                </ActionButton>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </AppLayout>
  );
}
