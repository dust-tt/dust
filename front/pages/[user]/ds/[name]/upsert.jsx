import AppLayout from "@app/components/AppLayout";
import MainTab from "@app/components/data_source/MainTab";
import { Button } from "@app/components/Button";
import { unstable_getServerSession } from "next-auth/next";
import { ActionButton } from "@app/components/Button";
import { authOptions } from "@app/pages/api/auth/[...nextauth]";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { ArrowUpOnSquareStackIcon } from "@heroicons/react/24/outline";
import { classNames } from "@app/lib/utils";
import { useRef } from "react";
import { useEffect } from "react";
import { useRouter } from "next/router";

const { URL, GA_TRACKING_ID = null } = process.env;

export default function DataSourceUpsert({
  dataSource,
  readOnly,
  loadDocumentId,
  user,
  ga_tracking_id,
}) {
  const { data: session } = useSession();

  const fileInputRef = useRef(null);

  const [documentId, setDocumentId] = useState("");
  const [text, setText] = useState("");

  const [disabled, setDisabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setDisabled(!documentId || !text);
  }, [documentId, text]);

  useEffect(() => {
    if (loadDocumentId) {
      setDocumentId(loadDocumentId);
      setDownloading(true);
      setDisabled(true);
      fetch(
        `/api/data_sources/${user}/${
          dataSource.name
        }/documents/${encodeURIComponent(loadDocumentId)}`
      ).then(async (res) => {
        if (res.ok) {
          const document = await res.json();
          setDisabled(false);
          setDownloading(false);
          setText(document.text);
        }
      });
    }
  }, [loadDocumentId]);

  const handleFileLoadedEnded = (e) => {
    const content = e.target.result;
    setText(content);
  };

  const handleFileUpload = (file) => {
    // Enforce FreePlan limit: 1MB per document.
    if (file.size > 1024 * 1024) {
      window.alert(
        "DataSource document upload size is limited to 1MB on our free plan. Contact team@dust.tt if you want to increase it."
      );
      return;
    }
    let fileData = new FileReader();
    fileData.onloadend = handleFileLoadedEnded;
    fileData.readAsText(file);
  };

  const router = useRouter();

  const handleUpsert = async () => {
    setLoading(true);
    const res = await fetch(
      `/api/data_sources/${session.user.username}/${
        dataSource.name
      }/documents/${encodeURIComponent(documentId)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
        }),
      }
    );
    router.push(`/${session.user.username}/ds/${dataSource.name}`);
  };

  return (
    <AppLayout
      ga_tracking_id={ga_tracking_id}
      dataSource={{ name: dataSource.name }}
    >
      <div className="flex flex-col">
        <div className="flex flex-initial mt-2">
          <MainTab
            currentTab="Documents"
            user={user}
            readOnly={false}
            dataSource={dataSource}
          />
        </div>

        <div className="px-4 mt-2 max-w-4xl mx-auto space-y-6 divide-y divide-gray-200">
          <div>
            <div className="flex flex-1">
              <div className="w-full mb-8">
                <div className="space-y-6 divide-y divide-gray-200 mt-4"></div>

                <div className="mt-2 grid gap-y-4 gap-x-4 sm:grid-cols-5">
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
                          "block w-full min-w-0 flex-1 rounded-md text-sm",
                          "border-gray-300 focus:border-violet-500 focus:ring-violet-500"
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
              <div className="w-full">
                <div className="sm:col-span-5">
                  <h3 className="text-sm font-medium text-gray-700">
                    Text Content
                  </h3>
                  <p className="my-2 text-sm text-gray-500">
                    Upload or copy the text data for the document you want to
                    create or replace (upsert).
                  </p>
                  <div className="mt-1 flex rounded-md shadow-sm">
                    <textarea
                      type="text"
                      name="text"
                      id="text"
                      rows="20"
                      className={classNames(
                        "block w-full min-w-0 flex-1 rounded-md text-sm",
                        "border-gray-300 focus:border-violet-500 focus:ring-violet-500",
                        downloading ? "text-gray-300" : ""
                      )}
                      readOnly={readOnly}
                      disabled={downloading}
                      value={downloading ? "Downloading..." : text}
                      onChange={(e) => setText(e.target.value)}
                    />
                  </div>
                  <div className="mt-4 w-full leading-4">
                    <div className=""></div>
                    <div className="mt-6 flex flex-row">
                      <div className="flex-1"></div>
                      <div className="flex-initial ml-2">
                        <input
                          className="hidden"
                          type="file"
                          ref={fileInputRef}
                          onChange={(e) => {
                            handleFileUpload(e.target.files[0]);
                          }}
                        ></input>
                        <Button
                          onClick={() => {
                            fileInputRef.current?.click();
                          }}
                          disabled={readOnly}
                        >
                          <ArrowUpOnSquareStackIcon className="-ml-1 mr-1 h-5 w-5" />
                          Upload
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="pt-6 flex flex-row">
            <div className="flex-initial">
              <ActionButton
                disabled={disabled || loading || readOnly}
                onClick={() => {
                  handleUpsert();
                }}
              >
                {loading ? "Embeding..." : "Upsert"}
              </ActionButton>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export async function getServerSideProps(context) {
  const session = await unstable_getServerSession(
    context.req,
    context.res,
    authOptions
  );

  if (!session) {
    return {
      redirect: {
        destination: `/`,
        permanent: false,
      },
    };
  }

  let readOnly = !session || context.query.user !== session.user.username;

  const [dataSourceRes] = await Promise.all([
    fetch(
      `${URL}/api/data_sources/${context.query.user}/${context.query.name}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Cookie: context.req.headers.cookie,
        },
      }
    ),
  ]);

  if (dataSourceRes.status === 404) {
    return {
      notFound: true,
    };
  }

  const [dataSource] = await Promise.all([dataSourceRes.json()]);

  return {
    props: {
      session,
      readOnly,
      dataSource: dataSource.dataSource,
      user: context.query.user,
      loadDocumentId: context.query.documentId || null,
      ga_tracking_id: GA_TRACKING_ID,
    },
  };
}
