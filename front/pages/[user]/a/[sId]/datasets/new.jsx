import AppLayout from "../../../../../components/app/AppLayout";
import MainTab from "../../../../../components/app/MainTab";
import { ActionButton, Button } from "../../../../../components/Button";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../../api/auth/[...nextauth]";
import { PlusIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { classNames } from "../../../../../lib/utils";
import { Tab } from "@headlessui/react";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import "@uiw/react-textarea-code-editor/dist.css";

const CodeEditor = dynamic(
  () => import("@uiw/react-textarea-code-editor").then((mod) => mod.default),
  { ssr: false }
);

const eqSet = (xs, ys) =>
  xs.size === ys.size && [...xs].every((x) => ys.has(x));

const { URL } = process.env;

export default function App({ app }) {
  const { data: session } = useSession();

  const [disable, setDisabled] = useState(true);

  const [datasetName, setAppName] = useState("");
  const [datasetNameError, setDatasetNameError] = useState(null);

  const [datasetDescription, setDatasetDescription] = useState("");

  const [datasetData, setDatasetData] = useState(
    '[\n  {\n    "foo": "hello",\n    "bar": "world"\n  }\n]'
  );
  const [datasetDataKeys, setDatasetDataKeys] = useState(["foo"]);

  const [datasetDataError, setDatasetDataError] = useState(null);

  const datasetValidation = () => {
    let valid = true;

    if (datasetName.length == 0) {
      setDatasetNameError(null);
      valid = false;
    } else if (!datasetName.match(/^[a-zA-Z0-9\._\-]+$/)) {
      setDatasetNameError(
        "Dataset name must only contain letters, numbers, and the characters `._-`"
      );
      valid = false;
    } else {
      setDatasetNameError(null);
    }

    let parsed = null;
    try {
      parsed = JSON.parse(datasetData);
    } catch (e) {
      setDatasetDataError("Invalid JSON");
      valid = false;
    }

    if (parsed) {
      if (!Array.isArray(parsed)) {
        setDatasetDataError("Data does not parse as a JSON array");
        valid = false;
      } else if (parsed.length == 0) {
        setDatasetDataError("Data must be a non empty array");
        valid = false;
      } else {
        let keys = new Set(Object.keys(parsed[0]));
        console.log(keys);
        let valid_keys = true;
        for (var i in parsed) {
          let k = new Set(Object.keys(parsed[i]));
          if (!eqSet(k, keys)) {
            setDatasetDataError(
              "Keys mismatch between data entries: " +
                Object.keys(parsed[0]) +
                " != " +
                Object.keys(parsed[i])
            );
            valid_keys = false;
            valid = false;
            break;
          }
        }
        if (valid_keys) {
          setDatasetDataKeys(Object.keys(parsed[0]));
          setDatasetDataError(null);
        }
      }
    }

    return valid;
  };

  useEffect(() => {
    setDisabled(!datasetValidation());
  }, [datasetName, datasetData]);

  return (
    <AppLayout app={{ sId: app.sId, name: app.name }}>
      <div className="flex flex-col">
        <div className="flex flex-initial mt-2">
          <MainTab
            app={{ sId: app.sId, name: app.name }}
            current_tab="Datasets"
          />
        </div>
        <div className="flex flex-1">
          <div className="w-full px-4 sm:px-6">
            <form
              action="/api/datasets"
              method="POST"
              className="space-y-6 divide-y divide-gray-200 mt-4"
            >
              <div className="space-y-8 divide-y divide-gray-200">
                <div>
                  <div className="mt-2 grid grid-cols-1 gap-y-4 gap-x-4 sm:grid-cols-6">
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="datasetName"
                        className="block text-sm font-medium text-gray-700"
                      >
                        Dataset name
                      </label>
                      <div className="mt-1 flex rounded-md shadow-sm">
                        <input
                          type="text"
                          name="name"
                          id="datasetName"
                          className={classNames(
                            "block w-full min-w-0 flex-1 rounded-md sm:text-sm",
                            datasetNameError
                              ? "border-gray-300 focus:border-red-500 border-red-500 focus:ring-red-500"
                              : "border-gray-300 focus:border-violet-500 focus:ring-violet-500"
                          )}
                          value={datasetName}
                          onChange={(e) => setAppName(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-4">
                      <div className="flex justify-between">
                        <label
                          htmlFor="datasetDescription"
                          className="block text-sm font-medium text-gray-700"
                        >
                          Description
                        </label>
                        <div className="font-normal text-gray-400 text-sm">
                          optional
                        </div>
                      </div>
                      <div className="mt-1 flex rounded-md shadow-sm">
                        <input
                          type="text"
                          name="description"
                          id="datasetDescription"
                          className="block w-full min-w-0 flex-1 rounded-md border-gray-300 focus:border-violet-500 focus:ring-violet-500 sm:text-sm"
                          value={datasetDescription}
                          onChange={(e) =>
                            setDatasetDescription(e.target.value)
                          }
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-6">
                      <div className="flex justify-between">
                        <label
                          htmlFor="datasetData"
                          className="block text-sm font-medium text-gray-700"
                        >
                          Data
                        </label>
                      </div>
                      <div className="mt-1 w-full">
                        <div
                          className={classNames(
                            "border",
                            datasetDataError
                              ? "border-red-500"
                              : "border-gray-300"
                          )}
                        >
                          <CodeEditor
                            value={datasetData}
                            language="json"
                            placeholder=""
                            onChange={(evn) => setDatasetData(evn.target.value)}
                            padding={15}
                            minHeight={300}
                            style={{
                              fontSize: 12,
                              backgroundColor: "#f5f5f5",
                              fontFamily:
                                "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                            }}
                          />
                        </div>
                        <p
                          className={classNames(
                            "text-xs mt-1",
                            datasetDataError ? "text-red-500" : "text-gray-400"
                          )}
                        >
                          {datasetDataError
                            ? datasetDataError
                            : "Data is valid with entries keys: [" + datasetDataKeys + "]"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <div className="flex">
                  <Button
                    disabled={disable}
                    type="submit"
                    // onClick={() => handleSubmit()}
                  >
                    Create
                  </Button>
                </div>
              </div>
            </form>
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

  // TODO(spolu): allow public viewing of apps

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

  const res = await fetch(`${URL}/api/apps/${context.query.sId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Cookie: context.req.headers.cookie,
    },
  });
  const data = await res.json();

  return {
    props: { session, app: data.app },
  };
}
