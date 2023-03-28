import Block from "./Block";
import { classNames, shallowBlockClone } from "@app/lib/utils";
import dynamic from "next/dynamic";
import TextareaAutosize from "react-textarea-autosize";
import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import "@uiw/react-textarea-code-editor/dist.css";
import ModelPicker from "@app/components/app/ModelPicker";
import DataSourcePicker from "@app/components/app/DataSourcePicker";

const CodeEditor = dynamic(
  () => import("@uiw/react-textarea-code-editor").then((mod) => mod.default),
  { ssr: false }
);

export default function DataSource({
  user,
  app,
  spec,
  run,
  block,
  status,
  running,
  readOnly,
  onBlockUpdate,
  onBlockDelete,
  onBlockUp,
  onBlockDown,
  onBlockNew,
}) {
  const handleDataSourcesChange = (dataSources) => {
    let b = shallowBlockClone(block);
    b.config.data_sources = dataSources;
    onBlockUpdate(b);
  };

  const handleTopKChange = (top_k) => {
    let b = shallowBlockClone(block);
    b.config.top_k = top_k;
    onBlockUpdate(b);
  };

  const handleQueryChange = (query) => {
    let b = shallowBlockClone(block);
    b.spec.query = query;
    onBlockUpdate(b);
  };

  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [newStop, setNewStop] = useState("");

  return (
    <Block
      user={user}
      app={app}
      spec={spec}
      run={run}
      block={block}
      status={status}
      running={running}
      readOnly={readOnly}
      canUseCache={false}
      onBlockUpdate={onBlockUpdate}
      onBlockDelete={onBlockDelete}
      onBlockUp={onBlockUp}
      onBlockDown={onBlockDown}
      onBlockNew={onBlockNew}
    >
      <div className="mx-4 flex w-full flex-col">
        <div className="flex flex-col xl:flex-row xl:space-x-2">
          <div className="mr-2 flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
            <div className="mr-1 flex flex-initial">data source:</div>
            <DataSourcePicker
              currentUser={user}
              readOnly={readOnly}
              currentDataSources={block.config.data_sources || []}
              onDataSourcesUpdate={(dataSources) => {
                handleDataSourcesChange(dataSources);
              }}
            />
          </div>
          <div className="flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
            <div className="flex flex-initial">top_k:</div>
            <div className="flex flex-initial font-normal">
              <input
                type="text"
                className={classNames(
                  "block w-8 flex-1 rounded-md px-1 py-1 text-sm font-normal",
                  readOnly
                    ? "border-white ring-0 focus:border-white focus:ring-0"
                    : "border-white focus:border-gray-300 focus:ring-0"
                )}
                readOnly={readOnly}
                value={block.config.top_k}
                onChange={(e) => handleTopKChange(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col space-y-1 text-sm font-medium leading-8 text-gray-700">
          <div className="flex flex-initial items-center">query:</div>
          <div className="flex w-full font-normal">
            <div className="w-full leading-5">
              <div
                className={classNames("border border-slate-100 bg-slate-100")}
                style={{
                  minHeight: "48px",
                }}
              >
                <CodeEditor
                  readOnly={readOnly}
                  value={block.spec.query}
                  language="jinja2"
                  placeholder=""
                  onChange={(e) => handleQueryChange(e.target.value)}
                  padding={3}
                  style={{
                    color: "rgb(55 65 81)",
                    fontSize: 13,
                    fontFamily:
                      "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                    backgroundColor: "rgb(241 245 249)",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Block>
  );
}
