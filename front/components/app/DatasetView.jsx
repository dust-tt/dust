import { classNames } from "@app/lib/utils";
import { Button } from "@app/components/Button";
import { checkDatasetData } from "@app/lib/datasets";
import TextareaAutosize from "react-textarea-autosize";
import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import {
  PlusIcon,
  PlusCircleIcon,
  XCircleIcon,
} from "@heroicons/react/20/solid";
import {
  ArrowUpOnSquareStackIcon,
  ArrowDownOnSquareIcon,
} from "@heroicons/react/24/outline";
import "@uiw/react-textarea-code-editor/dist.css";

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
}) {
  const fileInputRef = useRef(null);

  if (!dataset) {
    dataset = {
      name: "",
      description: "",
      data: genDefaultDataset(),
    };
  }
  if (!datasets) {
    datasets = [];
  }

  const [datasetName, setDatasetName] = useState(dataset.name);
  const [datasetNameError, setDatasetNameError] = useState(null);
  const [datasetDescription, setDatasetDescription] = useState(
    dataset.description
  );
  const [datasetData, setDatasetData] = useState(dataset.data);

  if (!dataset.keys) {
    dataset.keys = [];
    try {
      dataset.keys = checkDatasetData(datasetData);
    } catch (e) {
      // no-op
    }
  }
  const [datasetKeys, setDatasetKeys] = useState(dataset.keys);
  const [datasetTypes, setDatasetTypes] = useState([]);
  const [datasetInitializing, setDatasetInitializing] = useState(true);

  const datasetNameValidation = () => {
    let valid = true;

    let exists = false;
    datasets.forEach((d) => {
      if (d.name == datasetName && d.name != dataset.name) {
        exists = true;
      }
    });
    if (exists) {
      setDatasetNameError("A dataset with the same name already exists");
      valid = false;
    } else if (datasetName.length == 0) {
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
    let finalDataset = [];

    datasetData.map((d, i) => {
      let entry = {};
      datasetKeys.map((k) => {
        entry[k] = datasetData[i][k];
        let type = datasetTypes[datasetKeys.indexOf(k)];
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

  const getValueType = (value) => {
    let type = typeof value;
    if (type === "object") {
      return type;
    }
    try {
      let parsed = JSON.parse(value);
      if (typeof parsed === "number") {
        type = "number";
      } else if (typeof parsed === "boolean") {
        type = "boolean";
      } else if (typeof parsed === "object") {
        type = "object";
      } else {
        type = "string";
      }
    } catch (err) {
      type = "string";
    }
    return type;
  };

  const inferDatasetTypes = () => {
    let datasetTypes = [];
    // Infer the dataset types based on the first entry
    for (let i = 0; i < datasetKeys.length; i++) {
      let key = datasetKeys[i];
      let firstEntry = datasetData[0][key];
      let type = getValueType(firstEntry);
      datasetTypes.push(type);
    }
    setDatasetTypes(datasetTypes);
    if (datasetInitializing) {
      setTimeout(() => {
        setDatasetInitializing(false);
      }, 10);
    }
  };

  const handleKeyUpdate = (i, newKey) => {
    const oldKey = datasetKeys[i];
    let data = datasetData.map((d) => {
      d[newKey] = d[oldKey];
      delete d[oldKey];
      return d;
    });
    let keys = datasetKeys.map((k, j) => {
      if (i == j) {
        return newKey;
      }
      return k;
    });
    setDatasetData(data);
    setDatasetKeys(keys);
  };

  const newKey = () => {
    let base = "new_key";
    let idx = 0;
    for (let i = 0; i < datasetKeys.length; i++) {
      if (`${base}_${idx}` == datasetKeys[i]) {
        idx += 1;
        i = 0;
      }
    }
    return `${base}_${idx}`;
  };

  const handleNewKey = (i) => {
    let keys = datasetKeys.map((k) => k);
    let n = newKey();
    keys.splice(i + 1, 0, newKey());

    let data = datasetData.map((d) => {
      d[n] = "";
      return d;
    });
    setDatasetData(data);
    setDatasetKeys(keys);

    let types = datasetTypes;
    types[i + 1] = "string";
    setDatasetTypes(types);
  };

  const handleDeleteKey = (i) => {
    let data = datasetData.map((d) => {
      delete d[datasetKeys[i]];
      return d;
    });

    let keys = datasetKeys.map((k) => k);
    keys.splice(i, 1);

    setDatasetData(data);
    setDatasetKeys(keys);
  };

  const handleValueChange = (i, k, value) => {
    let data = datasetData.map((d, j) => {
      if (i == j) {
        d[k] = value;
      }
      return d;
    });
    setDatasetData(data);
  };

  const handleNewEntry = (i) => {
    let data = datasetData.map((d) => {
      return d;
    });
    let entry = {};
    datasetKeys.forEach((k) => {
      entry[k] = "";
    });
    data.splice(i + 1, 0, entry);
    setDatasetData(data);
  };

  const handleDeleteEntry = (i) => {
    let data = datasetData.map((d) => {
      return d;
    });
    data.splice(i, 1);
    setDatasetData(data);
  };

  const handleFileLoaded = (e) => {
    const content = e.target.result;
    let data = [];
    try {
      data = content
        .split("\n")
        .filter((l) => {
          return l.length > 0;
        })
        .map((l, i) => {
          try {
            return JSON.parse(l);
          } catch (e) {
            e.line = i;
            throw e;
          }
        });
    } catch (e) {
      window.alert(`Error parsing JSONL line ${e.line}: ${e}`);
      return;
    }
    if (data.length > 256) {
      window.alert("Dataset size is currently limited to 256 entries");
      return;
    }
    let keys = [];
    try {
      keys = checkDatasetData(data);
    } catch (e) {
      window.alert(`${e}`);
    }

    setDatasetKeys(keys);
    setDatasetData(data);
    setDatasetTypes([]);
    onUpdate(datasetInitializing, datasetTypesValidation(), {
      name: datasetName,
      keys: datasetKeys,
      description: datasetDescription || "",
      data: datasetData,
    });
  };

  const handleFileUpload = (file) => {
    if (file.size > 1024 * 512) {
      window.alert("JSONL upload size is currently limited to 512KB");
      return;
    }
    let fileData = new FileReader();
    fileData.onloadend = handleFileLoaded;
    fileData.readAsText(file);
  };

  useEffect(() => {
    // Validate the dataset types and dataset name
    let valid = datasetTypesValidation() && datasetNameValidation();

    if (onUpdate) {
      // TODO(spolu): Optimize, as it might not be great to send the entire data on each update.
      onUpdate(datasetInitializing, valid, {
        name: datasetName,
        keys: datasetKeys,
        description: datasetDescription || "",
        data: exportDataset(),
      });
    }
  }, [datasetName, datasetDescription, datasetData, datasetKeys, datasetTypes]);

  return (
    <div>
      <div className="mt-2 grid gap-y-4 gap-x-4 sm:grid-cols-5">
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
                  ? "border-gray-300 focus:border-red-500 border-red-500 focus:ring-red-500"
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
            <div className="font-normal text-gray-400 text-sm">optional</div>
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
                  <div className="flex group items-center bg-slate-300">
                    <div className="flex flex-1">
                      <input
                        className={classNames(
                          "px-1 py-1 font-normal text-[13px] font-mono bg-slate-300 border-0 outline-none focus:outline-none w-full",
                          readOnly
                            ? "border-white ring-0 focus:ring-0 focus:border-white"
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
                          <div className="flex flex-initial w-4">
                            <XCircleIcon
                              className="h-4 w-4 hidden group-hover:block text-gray-400 hover:text-red-500 cursor-pointer"
                              onClick={(e) => {
                                handleDeleteKey(j);
                              }}
                            />
                          </div>
                        ) : null}
                        <div className="flex flex-initial w-4 mr-2">
                          <PlusCircleIcon
                            className="h-4 w-4 hidden group-hover:block text-gray-400 hover:text-emerald-500 cursor-pointer"
                            onClick={(e) => {
                              handleNewKey(j);
                            }}
                          />
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="sm:col-span-7 bg-slate-100">
                  {readOnly ? (
                    <span className="text-gray-700 block px-4 py-2 text-sm cursor-pointer whitespace-nowrap">
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
                              ? "text-gray-900 font-semibold underline underline-offset-4"
                              : "text-gray-700 font-normal hover:text-gray-900",
                            "px-1 py-1 text-[13px] font-mono"
                          )}
                          onClick={(e) => {
                            let types = [...datasetTypes];
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
                          <div className="flex group items-center bg-slate-300">
                            <input
                              className={classNames(
                                "flex-1 px-1 py-1 text-[13px] font-mono bg-slate-300 border-0 outline-none focus:outline-none",
                                readOnly
                                  ? "border-white ring-0 focus:ring-0 focus:border-white"
                                  : "border-white ring-0 focus:border-gray-300 focus:ring-0"
                              )}
                              readOnly={true}
                              value={k}
                            />
                          </div>
                        </div>
                        <div
                          className={classNames(
                            "col-span-7 inline-grid space-y-0 resize-none text-[13px] font-mono px-0 py-0 border bg-slate-100",
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
                                "w-full resize-none font-normal text-[13px] font-mono px-1 py-0 bg-transparent border-0 ring-0 focus:ring-0",
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
                      <div className="flex justify-end items-center text-xs">
                        {datasetData.length > 1 ? (
                          <div className="flex-initial">
                            <XCircleIcon
                              className="h-4 w-4 text-gray-300 hover:text-red-500 cursor-pointer"
                              onClick={(e) => {
                                handleDeleteEntry(i);
                              }}
                            />
                          </div>
                        ) : null}
                        <div className="flex-initial">
                          <PlusCircleIcon
                            className="h-5 w-5 text-gray-300 hover:text-emerald-500 cursor-pointer"
                            onClick={(e) => {
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
              <Button
                onClick={() => {
                  handleNewEntry(datasetData.length - 1);
                }}
              >
                <PlusIcon className="-ml-1 mr-1 h-5 w-5" />
                New Entry
              </Button>
              <div className="flex-1"></div>
              <div className="flex-initial ml-2">
                <Button
                  onClick={() => {
                    var dataStr =
                      "data:text/jsonl;charset=utf-8," +
                      encodeURIComponent(
                        exportDataset()
                          .map((d) => JSON.stringify(d))
                          .join("\n")
                      );
                    var downloadAnchorNode = document.createElement("a");
                    downloadAnchorNode.setAttribute("href", dataStr);
                    downloadAnchorNode.setAttribute(
                      "download",
                      `dataset-${dataset.name}.jsonl`
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
              <div className="flex-initial ml-2">
                <input
                  className="hidden"
                  type="file"
                  accept=".jsonl"
                  ref={fileInputRef}
                  onChange={(e) => {
                    handleFileUpload(e.target.files[0]);
                  }}
                ></input>
                {!readOnly ? (
                  <Button
                    onClick={() => {
                      fileInputRef.current?.click();
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
