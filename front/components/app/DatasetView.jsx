import { classNames } from "../../lib/utils";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import "@uiw/react-textarea-code-editor/dist.css";
import { checkDatasetData } from "../../lib/datasets";

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
  const shuffled = defaultData.map((a) => a );
  shuffled.sort(() => 0.5 - Math.random());
  return JSON.stringify(shuffled.slice(0, 3), null, 2);
};

export default function DatasetView({
  readOnly,
  datasets,
  dataset,
  onUpdate,
  nameDisabled,
}) {
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
  let keys = [];
  try {
    keys = checkDatasetData(datasetData);
  } catch (e) {
    // no-op
  }
  const [datasetDataKeys, setDatasetDataKeys] = useState(keys);
  const [datasetDataError, setDatasetDataError] = useState(null);

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

    let keys = [];
    try {
      keys = checkDatasetData(datasetData);
      setDatasetDataKeys(keys);
      setDatasetDataError(null);
    } catch (e) {
      setDatasetDataError(e.message);
      valid = false;
    }

    return valid;
  };

  useEffect(() => {
    let valid = datasetValidation();
    if (onUpdate) {
      // TODO(spolu): Optimize, as it might not be great to send the entire data on each update.
      onUpdate(valid, {
        name: datasetName,
        description: datasetDescription || "",
        data: datasetData,
      });
    }
  }, [datasetName, datasetDescription, datasetData]);

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

        <div className="sm:col-span-6">
          <div className="flex justify-between">
            <label
              htmlFor="datasetData"
              className="block text-sm font-medium text-gray-700"
            >
              Data
            </label>
          </div>
          <div className="mt-1 w-full leading-4">
            <div
              className={classNames(
                "border bg-gray-100",
                datasetDataError ? "border-red-500" : "border-gray-300"
              )}
              style={{
                minHeight: "302px",
              }}
            >
              <CodeEditor
                readOnly={readOnly}
                value={datasetData}
                language="json"
                placeholder=""
                onChange={(e) => setDatasetData(e.target.value)}
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
  );
}
