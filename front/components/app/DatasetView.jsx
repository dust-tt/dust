import { classNames } from "../../lib/utils";
import { Button } from "../Button";
import { checkDatasetData } from "../../lib/datasets";
import TextareaAutosize from "react-textarea-autosize";
import { useState, useEffect, useRef } from "react";
import { PlusCircleIcon, XCircleIcon } from "@heroicons/react/20/solid";
import { ArrowUpOnSquareStackIcon } from "@heroicons/react/24/outline";
import "@uiw/react-textarea-code-editor/dist.css";

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

  // console.log("KEYS", dataset.keys);
  if (!dataset.keys) {
    dataset.keys = [];
    try {
      dataset.keys = checkDatasetData(datasetData, false);
    } catch (e) {
      // no-op
    }
  }
  const [datasetKeys, setDatasetKeys] = useState(dataset.keys);

  const datasetValidation = () => {
    let valid = true;

    let exists = false;
    datasets.forEach((d) => {
      if (d.name == datasetName && d.name != dataset.name) {
        exists = true;
      }
    });
    if (exists) {
      setDatasetNameError(
        "Dataset name must only contain letters, numbers, and the characters `._-`"
      );
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
      keys = checkDatasetData(data, false);
    } catch (e) {
      window.alert(`${e}`);
    }
    setDatasetKeys(keys);
    setDatasetData(data);
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
    let valid = datasetValidation();
    if (onUpdate) {
      // TODO(spolu): Optimize, as it might not be great to send the entire data on each update.
      onUpdate(valid, {
        name: datasetName,
        keys: datasetKeys,
        description: datasetDescription || "",
        data: datasetData,
      });
    }
  }, [datasetName, datasetDescription, datasetData, datasetKeys]);

  return (
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

        <div className="sm:col-span-6 mt-2">
          <div className="mt-1 w-full leading-4">
            <div className="">
              <ul className="space-y-4">
                {datasetData.map((d, i) => (
                  <li key={i} className="space-y-[1px]">
                    {datasetKeys.map((k, j) => (
                      <div key={j} className="grid grid-cols-12">
                        <div className="col-span-2">
                          <div className="flex group items-center bg-slate-300">
                            <input
                              className={classNames(
                                "flex-1 px-1 py-1 font-normal text-sm py-0 font-mono bg-slate-300 border-0 outline-none focus:outline-none",
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
                            {!readOnly ? (
                              <>
                                {datasetKeys.length > 1 ? (
                                  <div className="flex-initial">
                                    <XCircleIcon
                                      className="h-4 w-4 hidden group-hover:block text-gray-400 hover:text-red-500 cursor-pointer"
                                      onClick={(e) => {
                                        handleDeleteKey(j);
                                      }}
                                    />
                                  </div>
                                ) : null}
                                <div className="flex-initial mr-2">
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
                        <TextareaAutosize
                          minRows={1}
                          className={classNames(
                            "col-span-10 resize-none px-1 py-1 font-normal text-sm py-0 font-mono bg-slate-100 border-0",
                            readOnly
                              ? "border-white ring-0 focus:ring-0 focus:border-white"
                              : "border-white focus:border-gray-300 focus:ring-0"
                          )}
                          readOnly={readOnly}
                          value={d[k]}
                          onChange={(e) => {
                            handleValueChange(i, k, e.target.value);
                          }}
                        />
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
              <div className="flex-1"></div>
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
