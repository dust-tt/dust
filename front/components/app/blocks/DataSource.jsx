import Block from "./Block";
import { classNames, shallowBlockClone } from "../../../lib/utils";
import dynamic from "next/dynamic";
import TextareaAutosize from "react-textarea-autosize";
import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import "@uiw/react-textarea-code-editor/dist.css";
import ModelPicker from "../ModelPicker";
import DataSourcePicker from "../DataSourcePicker";

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
  const handleDataSourceChange = (dataSource) => {
    console.log("DATASOURCE", dataSource);
    let b = shallowBlockClone(block);
    b.spec.project_id = dataSource.project_id;
    b.spec.data_source_id = dataSource.data_source_id;
    onBlockUpdate(b);
  };

  const handleTemperatureChange = (temperature) => {
    let b = shallowBlockClone(block);
    b.spec.temperature = temperature;
    onBlockUpdate(b);
  };

  const handleAddStop = (stop) => {
    let b = shallowBlockClone(block);
    b.spec.stop.push(stop);
    onBlockUpdate(b);
    setNewStop("");
  };

  const handleTopKChange = (top_k) => {
    let b = shallowBlockClone(block);
    b.spec.top_k = top_k;
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
      canUseCache={true}
      onBlockUpdate={onBlockUpdate}
      onBlockDelete={onBlockDelete}
      onBlockUp={onBlockUp}
      onBlockDown={onBlockDown}
      onBlockNew={onBlockNew}
    >
      <div className="flex flex-col mx-4 w-full">
        <div className="flex flex-col xl:flex-row xl:space-x-2">
          <div className="flex-initial flex flex-row items-center space-x-1 text-sm font-medium text-gray-700 leading-8 mr-2">
            <div className="flex flex-initial mr-1">data source:</div>
            <DataSourcePicker
              currentUser={user}
              readOnly={readOnly}
              dataSource={{
                project_id: block.spec.project_id || "",
                data_source_id: block.spec.data_source_id || "",
              }}
              onDataSourceUpdate={(dataSource) => {
                handleDataSourceChange(dataSource);
              }}
            />
          </div>
          <div className="flex-initial flex flex-row items-center space-x-1 text-sm font-medium text-gray-700 leading-8">
            <div className="flex flex-initial">top_k:</div>
            <div className="flex flex-initial font-normal">
              <input
                type="text"
                className={classNames(
                  "block flex-1 rounded-md px-1 font-normal text-sm py-1 w-8",
                  readOnly
                    ? "border-white ring-0 focus:ring-0 focus:border-white"
                    : "border-white focus:border-gray-300 focus:ring-0"
                )}
                readOnly={readOnly}
                value={block.spec.top_k || "8"}
                onChange={(e) => handleTopKChange(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col space-y-1 text-sm font-medium text-gray-700 leading-8">
          <div className="flex flex-initial items-center">query:</div>
          <div className="flex w-full font-normal">
            <div className="w-full leading-5">
              <div
                className={classNames("border bg-slate-100 border-slate-100")}
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
