import "@uiw/react-textarea-code-editor/dist.css";

import {
  PlusCircleIcon,
  PlusIcon,
  XCircleIcon,
} from "@heroicons/react/20/solid";
import {
  ArrowDownOnSquareIcon,
  ArrowUpOnSquareStackIcon,
} from "@heroicons/react/24/outline";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";

import { Button } from "@app/components/Button";
import { checkDatasetData } from "@app/lib/datasets";
import { getDatasetTypes, getValueType } from "@app/lib/datasets";
import { MODELS_STRING_MAX_LENGTH } from "@app/lib/utils";
import { classNames } from "@app/lib/utils";
import { DatasetEntry, DatasetType } from "@app/types/dataset";

const CodeEditor = dynamic(
  () => import("@uiw/react-textarea-code-editor").then((mod) => mod.default),
  { ssr: false }
);

const defaultData = [
  {
    question: "What is 12*4?",
    answer: "48",
  },
  {
    question: "What is 56/7?",
    answer: "8",
  },
  {
    question: "What is 43-78?",
    answer: "-35",
  },
  {
    question: "What is 2+2?",
    answer: "4",
  },
  {
    question: "What is 5^2?",
    answer: "25",
  },
  {
    question: "What is 81/9?",
    answer: "9",
  },
  {
    question: "What is 5-24?",
    answer: "-19",
  },
  {
    question: "What is 67*4?",
    answer: "268",
  },
  {
    question: "What is 5*6?",
    answer: "30",
  },
  {
    question: "What is 2^7?",
    answer: "128",
  },
  {
    question: "What is 7*6?",
    answer: "42",
  },
  {
    question: "What is 23*9?",
    answer: "207",
  },
];

const genDefaultDataset = () => {
  const shuffled = defaultData.map((a) => a);
  shuffled.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 3);
};

export default function DatasetView({
  readOnly,
  datasets,
  dataset,
  onUpdate,
  nameDisabled,
}: {
  readOnly: boolean;
  datasets: DatasetType[];
  dataset: DatasetType | null;
  onUpdate: (
    initializing: boolean,
    valid: boolean,
    dataset: DatasetType
  ) => void;
  nameDisabled: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!dataset) {
    dataset = {
      name: "",
      description: "",
      data: genDefaultDataset(),
    };
  }

  const [datasetName, setDatasetName] = useState(dataset.name);
  const [datasetNameError, setDatasetNameError] = useState("");
  const [datasetDescription, setDatasetDescription] = useState(
    dataset.description
  );
  const [datasetData, setDatasetData] = useState(dataset.data || []);

  const [datasetKeys, setDatasetKeys] = useState(checkDatasetData(datasetData));
  const [datasetTypes, setDatasetTypes] = useState([] as string[]);
  const [datasetInitializing, setDatasetInitializing] = useState(true);

  const datasetNameValidation = () => {
    let valid = true;

    let exists = false;
    datasets.forEach((d) => {
      if (d.name == datasetName && d.name != dataset?.name) {
        exists = true;
      }
    });
    if (exists) {
      setDatasetNameError("A dataset with the same name already exists");
      valid = false;
    } else if (datasetName.length == 0) {
      setDatasetNameError("");
      valid = false;
      // eslint-disable-next-line no-useless-escape
    } else if (!datasetName.match(/^[a-zA-Z0-9\._\-]+$/)) {
      setDatasetNameError(
        "Dataset name must only contain letters, numbers, and the characters `._-`"
      );
      valid = false;
    } else {
      setDatasetNameError("");
    }

    return valid;
  };

  const datasetTypesValidation = () => {
    // Initial inference of types
    if (datasetTypes.length == 0) {
      inferDatasetTypes();
    }

    // Check that all types are valid
    let valid = true;
    datasetData.map((d) => {
      datasetKeys.map((k) => {
        if (getValueType(d[k]) !== datasetTypes[datasetKeys.indexOf(k)]) {
          valid = false;
        }
      });
    });

    return valid;
  };

  // Export the dataset with correct types (post-editing and validation)
  const exportDataset = () => {
    const finalDataset = [] as any[];

    datasetData.map((d, i) => {
      const entry = {} as any;
      datasetKeys.map((k) => {
        entry[k] = datasetData[i][k];
        const type = datasetTypes[datasetKeys.indexOf(k)];
        try {
          // Save objects, numbers, and booleans with their proper types
          if (type !== "string") {
            entry[k] = JSON.parse(entry[k]);
          }
        } catch (err) {
          // no-op
        }
      });
      finalDataset.push(entry);
    });

    return finalDataset;
  };

  const inferDatasetTypes = () => {
    if (datasetData.length > 0) {
      setDatasetTypes(getDatasetTypes(datasetKeys, datasetData[0]));
      if (datasetInitializing) {
        setTimeout(() => {
          setDatasetInitializing(false);
        }, 10);
      }
    }
  };

  const handleKeyUpdate = (i: number, newKey: string) => {
    const oldKey = datasetKeys[i];
    const data = datasetData.map((d) => {
      d[newKey] = d[oldKey];
      delete d[oldKey];
      return d;
    });
    const keys = datasetKeys.map((k, j) => {
      if (i == j) {
        return newKey;
      }
      return k;
    });
    setDatasetData(data);
    setDatasetKeys(keys);
  };

  const newKey = () => {
    const base = "new_key";
    let idx = 0;
    for (let i = 0; i < datasetKeys.length; i++) {
      if (`${base}_${idx}` == datasetKeys[i]) {
        idx += 1;
        i = 0;
      }
    }
    return `${base}_${idx}`;
  };

  const handleNewKey = (i: number) => {
    const keys = datasetKeys.map((k) => k);
    const n = newKey();
    keys.splice(i + 1, 0, newKey());

    const data = datasetData.map((d) => {
      d[n] = "";
      return d;
    });
    setDatasetData(data);
    setDatasetKeys(keys);

    const types = datasetTypes;
    types[i + 1] = "string";
    setDatasetTypes(types);
  };

  const handleDeleteKey = (i: number) => {
    const data = datasetData.map((d) => {
      delete d[datasetKeys[i]];
      return d;
    });

    const keys = datasetKeys.map((k) => k);
    keys.splice(i, 1);

    setDatasetData(data);
    setDatasetKeys(keys);
  };

  const handleValueChange = (i: number, k: string, value: any) => {
    const data = datasetData.map((d, j) => {
      if (i == j) {
        d[k] = value;
      }
      return d;
    });
    setDatasetData(data);
  };

  const handleNewEntry = (i: number) => {
    const data = datasetData.map((d) => {
      return d;
    });
    const entry = {} as DatasetEntry;
    datasetKeys.forEach((k) => {
      entry[k] = "";
    });
    data.splice(i + 1, 0, entry);
    setDatasetData(data);
  };

  const handleDeleteEntry = (i: number) => {
    const data = datasetData.map((d) => {
      return d;
    });
    data.splice(i, 1);
    setDatasetData(data);
  };

  const handleFileLoaded = (e: any) => {
    const content = e.target.result;
    let data = [];
    try {
      data = content
        .split("\n")
        .filter((l: string) => {
          return l.length > 0;
        })
        .map((l: string, i: number) => {
          try {
            return JSON.parse(l);
          } catch (e: any) {
            e.line = i;
            throw e;
          }
        });
    } catch (e: any) {
      window.alert(`Error parsing JSONL line ${e.line}: ${e}`);
      return;
    }
    if (data.length > 256) {
      window.alert("Dataset size is currently limited to 256 entries");
      return;
    }
    let keys = [] as string[];
    try {
      keys = checkDatasetData(data);
    } catch (e) {
      window.alert(`${e}`);
    }

    setDatasetKeys(keys);
    setDatasetData(data);
    setDatasetTypes([]);
    onUpdate(datasetInitializing, datasetTypesValidation(), {
      name: datasetName.slice(0, MODELS_STRING_MAX_LENGTH),
      // keys: datasetKeys,
      description: (datasetDescription || "").slice(
        0,
        MODELS_STRING_MAX_LENGTH
      ),
      data: datasetData,
    });
  };

  const handleFileUpload = (file: File) => {
    if (file.size > 1024 * 512) {
      window.alert("JSONL upload size is currently limited to 512KB");
      return;
    }
    const fileData = new FileReader();
    fileData.onloadend = handleFileLoaded;
    fileData.readAsText(file);
  };

  useEffect(() => {
    // Validate the dataset types and dataset name
    const valid = datasetTypesValidation() && datasetNameValidation();

    if (onUpdate) {
      // TODO(spolu): Optimize, as it might not be great to send the entire data on each update.
      onUpdate(datasetInitializing, valid, {
        name: datasetName.slice(0, MODELS_STRING_MAX_LENGTH),
        // keys: datasetKeys,
        description: (datasetDescription || "").slice(
          0,
          MODELS_STRING_MAX_LENGTH
        ),
        data: exportDataset(),
      });
    }
  }, [datasetName, datasetDescription, datasetData, datasetKeys, datasetTypes]);

  return (
    <div>
      <div className="mt-2 grid gap-x-4 gap-y-4 sm:grid-cols-5">
        <div className="sm:col-span-1">
          <label
            htmlFor="datasetName"
            className="block text-sm font-medium text-gray-700"
          >
            Dataset Name
          </label>
          <div className="mt-1 flex rounded-md shadow-sm">
            <input
              disabled={readOnly || nameDisabled}
              type="text"
              name="name"
              id="datasetName"
              className={classNames(
                "block w-full min-w-0 flex-1 rounded-md sm:text-sm",
                datasetNameError
                  ? "border-gray-300 border-red-500 focus:border-red-500 focus:ring-red-500"
                  : "border-gray-300 focus:border-violet-500 focus:ring-violet-500"
              )}
              value={datasetName}
              onChange={(e) => setDatasetName(e.target.value)}
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
            <div className="text-sm font-normal text-gray-400">optional</div>
          </div>
          <div className="mt-1 flex rounded-md shadow-sm">
            <input
              disabled={readOnly}
              type="text"
              name="description"
              id="datasetDescription"
              className="block w-full min-w-0 flex-1 rounded-md border-gray-300 focus:border-violet-500 focus:ring-violet-500 sm:text-sm"
              value={datasetDescription || ""}
              onChange={(e) => setDatasetDescription(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 sm:col-span-5">
          <h3 className="text-sm font-medium text-gray-700">Schema</h3>
          {!readOnly ? (
            <p className="mt-2 text-sm text-gray-500">
              Set the properties and types to ensure your dataset is valid when
              you update it.
            </p>
          ) : null}
        </div>

        <div className="sm:col-span-5">
          <div className="space-y-[1px]">
            {datasetKeys.map((k, j) => (
              <div key={j} className="grid sm:grid-cols-10">
                <div className="sm:col-span-3">
                  <div className="group flex items-center bg-slate-300">
                    <div className="flex flex-1">
                      <input
                        className={classNames(
                          "w-full border-0 bg-slate-300 px-1 py-1 font-mono text-[13px] font-normal outline-none focus:outline-none",
                          readOnly
                            ? "border-white ring-0 focus:border-white focus:ring-0"
                            : "border-white ring-0 focus:border-gray-300 focus:ring-0"
                        )}
                        readOnly={readOnly}
                        value={k}
                        onChange={(e) => {
                          handleKeyUpdate(j, e.target.value);
                        }}
                      />
                    </div>
                    {!readOnly ? (
                      <>
                        {datasetKeys.length > 1 ? (
                          <div className="flex w-4 flex-initial">
                            <XCircleIcon
                              className="hidden h-4 w-4 cursor-pointer text-gray-400 hover:text-red-500 group-hover:block"
                              onClick={() => {
                                handleDeleteKey(j);
                              }}
                            />
                          </div>
                        ) : null}
                        <div className="mr-2 flex w-4 flex-initial">
                          <PlusCircleIcon
                            className="hidden h-4 w-4 cursor-pointer text-gray-400 hover:text-emerald-500 group-hover:block"
                            onClick={() => {
                              handleNewKey(j);
                            }}
                          />
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="bg-slate-100 sm:col-span-7">
                  {readOnly ? (
                    <span className="block cursor-pointer whitespace-nowrap px-4 py-2 text-sm text-gray-700">
                      {datasetTypes[j] ? datasetTypes[j] : "string"}
                    </span>
                  ) : (
                    <div className="inline-flex" role="group">
                      {["string", "number", "boolean", "object"].map((type) => (
                        <button
                          key={type}
                          type="button"
                          disabled={readOnly}
                          className={classNames(
                            datasetTypes && datasetTypes[j] == type
                              ? "font-semibold text-gray-900 underline underline-offset-4"
                              : "font-normal text-gray-700 hover:text-gray-900",
                            "px-1 py-1 font-mono text-[13px]"
                          )}
                          onClick={() => {
                            const types = [...datasetTypes];
                            types[j] = type;
                            setDatasetTypes(types);
                          }}
                        >
                          {type == "object" ? "JSON" : type}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 sm:col-span-5">
          <h3 className="text-sm font-medium text-gray-700">Data</h3>
          {!readOnly ? (
            <p className="mt-2 text-sm text-gray-500">
              Add and edit your dataset entries below. You can insert or remove
              entries using buttons on the right.
            </p>
          ) : null}
          <div className="mt-4 w-full leading-4">
            <div className="">
              <ul className="space-y-2">
                {datasetData.map((d, i) => (
                  <li key={i} className="space-y-[1px]">
                    {datasetKeys.map((k, j) => (
                      <div key={j} className="grid grid-cols-10">
                        <div className="col-span-3">
                          <div className="group flex items-center bg-slate-300">
                            <input
                              className={classNames(
                                "flex-1 border-0 bg-slate-300 px-1 py-1 font-mono text-[13px] outline-none focus:outline-none",
                                readOnly
                                  ? "border-white ring-0 focus:border-white focus:ring-0"
                                  : "border-white ring-0 focus:border-gray-300 focus:ring-0"
                              )}
                              readOnly={true}
                              value={k}
                            />
                          </div>
                        </div>
                        <div
                          className={classNames(
                            "col-span-7 inline-grid resize-none space-y-0 border bg-slate-100 px-0 py-0 font-mono text-[13px]",
                            d[k] === "" ||
                              !datasetTypes[datasetKeys.indexOf(k)] ||
                              getValueType(d[k]) ===
                                datasetTypes[datasetKeys.indexOf(k)]
                              ? "border-slate-100"
                              : "border-red-500"
                          )}
                        >
                          {datasetTypes[datasetKeys.indexOf(k)] === "object" ? (
                            <CodeEditor
                              readOnly={readOnly}
                              value={
                                typeof d[k] === "string"
                                  ? d[k]
                                  : JSON.stringify(d[k], null, 2)
                              }
                              language="json"
                              onChange={(e) => {
                                handleValueChange(i, k, e.target.value);
                              }}
                              padding={4}
                              className="bg-slate-100"
                              style={{
                                fontSize: 13,
                                fontFamily:
                                  "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                                backgroundColor: "rgb(241 245 249)",
                              }}
                            />
                          ) : (
                            <TextareaAutosize
                              minRows={1}
                              className={classNames(
                                "w-full resize-none border-0 bg-transparent px-1 py-0 font-mono text-[13px] font-normal ring-0 focus:ring-0",
                                readOnly ? "text-gray-500" : "text-gray-700"
                              )}
                              readOnly={readOnly}
                              value={d[k]}
                              onChange={(e) => {
                                handleValueChange(i, k, e.target.value);
                              }}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                    {!readOnly ? (
                      <div className="flex items-center justify-end text-xs">
                        {datasetData.length > 1 ? (
                          <div className="flex-initial">
                            <XCircleIcon
                              className="h-4 w-4 cursor-pointer text-gray-300 hover:text-red-500"
                              onClick={() => {
                                handleDeleteEntry(i);
                              }}
                            />
                          </div>
                        ) : null}
                        <div className="flex-initial">
                          <PlusCircleIcon
                            className="h-5 w-5 cursor-pointer text-gray-300 hover:text-emerald-500"
                            onClick={() => {
                              handleNewEntry(i);
                            }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-6 flex flex-row">
              {!readOnly ? (
                <Button
                  onClick={() => {
                    handleNewEntry(datasetData.length - 1);
                  }}
                >
                  <PlusIcon className="-ml-1 mr-1 h-5 w-5" />
                  New Entry
                </Button>
              ) : null}
              <div className="flex-1"></div>
              <div className="ml-2 flex-initial">
                <Button
                  onClick={() => {
                    const dataStr =
                      "data:text/jsonl;charset=utf-8," +
                      encodeURIComponent(
                        exportDataset()
                          .map((d) => JSON.stringify(d))
                          .join("\n")
                      );
                    const downloadAnchorNode = document.createElement("a");
                    downloadAnchorNode.setAttribute("href", dataStr);
                    downloadAnchorNode.setAttribute(
                      "download",
                      `dataset-${dataset?.name}.jsonl`
                    );
                    document.body.appendChild(downloadAnchorNode); // required for firefox
                    downloadAnchorNode.click();
                    downloadAnchorNode.remove();
                  }}
                >
                  <ArrowDownOnSquareIcon className="-ml-1 mr-1 h-5 w-5" />
                  Download
                </Button>
              </div>
              <div className="ml-2 flex-initial">
                <input
                  className="hidden"
                  type="file"
                  accept=".jsonl"
                  ref={fileInputRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFileUpload(e.target.files[0]);
                    }
                  }}
                ></input>
                {!readOnly ? (
                  <Button
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.click();
                      }
                    }}
                  >
                    <ArrowUpOnSquareStackIcon className="-ml-1 mr-1 h-5 w-5" />
                    JSONL
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
