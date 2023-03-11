import AppLayout from "../../../../components/app/AppLayout";
import MainTab from "../../../../components/profile/MainTab";
import { Button } from "../../../../components/Button";
import { unstable_getServerSession } from "next-auth/next";
import { ActionButton } from "../../../../components/Button";
import { authOptions } from "../../../api/auth/[...nextauth]";
import { PlusIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState } from "react";
import {
  ArrowUpOnSquareStackIcon,
  ArrowDownOnSquareIcon,
} from "@heroicons/react/24/outline";
import { classNames } from "../../../../lib/utils";
import { useRef } from "react";
import { useEffect } from "react";
import { useRouter } from "next/router";

const { URL, GA_TRACKING_ID = null } = process.env;

export default function DataSourceUpsert({
  dataSource,
  loadDocumentId,
  user,
  ga_tracking_id,
}) {
  const { data: session } = useSession();

  console.log("USER", user);

  const fileInputRef = useRef(null);

  const [documentId, setDocumentId] = useState("");
  const [text, setText] = useState("");

  const [disabled, setDisabled] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setDisabled(!documentId || !text);
  }, [documentId, text]);

  useEffect(() => {
    if (loadDocumentId) {
      setDocumentId(loadDocumentId);
      fetch(
        `/api/data_sources/${session.user.username}/${dataSource.name}/documents/${loadDocumentId}`
      ).then(async (res) => {
        if (res.ok) {
          const document = await res.json();
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
    if (file.size > 1024 * 1024) {
      window.alert("Upload size is currently limited to 1MB");
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
      `/api/data_sources/${session.user.username}/${dataSource.name}/documents/${documentId}`,
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
    router.push(`/${session.user.username}/data_sources/${dataSource.name}`);
  };

  return (
    <AppLayout ga_tracking_id={ga_tracking_id}>
      <div className="flex flex-col">
        <div className="flex flex-initial mt-2">
          <MainTab current_tab="DataSources" user={user} readOnly={false} />
        </div>

        <div className="px-4 sm:px-6 space-y-6 divide-y divide-gray-200">
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
                        className={classNames(
                          "block w-full min-w-0 flex-1 rounded-md sm:text-sm",
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
                        "block w-full min-w-0 flex-1 rounded-md sm:text-sm",
                        "border-gray-300 focus:border-violet-500 focus:ring-violet-500"
                      )}
                      value={text}
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
                disabled={disabled || loading}
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

  if (context.query.user != session.user.username) {
    return {
      redirect: {
        destination: `/`,
        permanent: false,
      },
    };
  }

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
      dataSource: dataSource.dataSource,
      user: context.query.user,
      loadDocumentId: context.query.documentId || null,
      ga_tracking_id: GA_TRACKING_ID,
    },
  };
}
