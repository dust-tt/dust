import "@uiw/react-textarea-code-editor/dist.css";

import { XMarkIcon } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type {
  AppType,
  SpecificationBlockType,
  SpecificationType,
} from "@dust-tt/types";
import type { BlockType, RunType } from "@dust-tt/types";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import dynamic from "next/dynamic";
import { useState } from "react";

import DataSourcePicker from "@app/components/data_source/DataSourcePicker";
import { classNames, shallowBlockClone } from "@app/lib/utils";

import Block from "./Block";

const CodeEditor = dynamic(
  () => import("@uiw/react-textarea-code-editor").then((mod) => mod.default),
  { ssr: false }
);

export default function DataSource({
  owner,
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
}: React.PropsWithChildren<{
  owner: WorkspaceType;
  app: AppType;
  spec: SpecificationType;
  run: RunType | null;
  block: SpecificationBlockType;
  status: any;
  running: boolean;
  readOnly: boolean;
  onBlockUpdate: (block: SpecificationBlockType) => void;
  onBlockDelete: () => void;
  onBlockUp: () => void;
  onBlockDown: () => void;
  onBlockNew: (blockType: BlockType | "map_reduce" | "while_end") => void;
}>) {
  const [newTagsIn, setNewTagsIn] = useState("");
  const [newTagsNot, setNewTagsNot] = useState("");
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const handleAddTagsIn = (tag: string) => {
    const b = shallowBlockClone(block);
    if (!b.config.filter) {
      b.config.filter = {};
    }
    if (!b.config.filter.tags) {
      b.config.filter.tags = {
        in: null,
        not: null,
      };
    }
    if (!b.config.filter.tags.in) {
      b.config.filter.tags.in = [];
    }
    b.config.filter.tags.in.push(tag);
    onBlockUpdate(b);
    setNewTagsIn("");
  };

  const handleRemoveTagsIn = (index?: number) => {
    const b = shallowBlockClone(block);
    if (!b.config.filter) {
      b.config.filter = {};
    }
    if (!b.config.filter.tags) {
      b.config.filter.tags = {
        in: null,
        not: null,
      };
    }
    if (!b.config.filter.tags.in) {
      b.config.filter.tags.in = [];
    }

    if (
      index !== undefined &&
      Number.isFinite(index) &&
      index < b.config.filter.tags.in.length
    ) {
      b.config.filter.tags.in.splice(index, 1);
    } else {
      b.config.filter.tags.in.splice(b.config.filter.tags.in.length - 1, 1);
    }
    if (b.config.filter.tags.in.length === 0) {
      b.config.filter.tags.in = null;
    }
    onBlockUpdate(b);
    setNewTagsIn("");
  };

  const handleAddTagsNot = (tag: string) => {
    const b = shallowBlockClone(block);
    if (!b.config.filter) {
      b.config.filter = {};
    }
    if (!b.config.filter.tags) {
      b.config.filter.tags = {
        in: null,
        not: null,
      };
    }
    if (!b.config.filter.tags.not) {
      b.config.filter.tags.not = [];
    }
    b.config.filter.tags.not.push(tag);
    onBlockUpdate(b);
    setNewTagsNot("");
  };

  const handleRemoveTagsNot = (index?: number) => {
    const b = shallowBlockClone(block);
    if (!b.config.filter) {
      b.config.filter = {};
    }
    if (!b.config.filter.tags) {
      b.config.filter.tags = {
        in: null,
        not: null,
      };
    }
    if (!b.config.filter.tags.not) {
      b.config.filter.tags.not = [];
    }

    if (
      index !== undefined &&
      Number.isFinite(index) &&
      index < b.config.filter.tags.not.length
    ) {
      b.config.filter.tags.not.splice(index, 1);
    } else {
      b.config.filter.tags.not.splice(b.config.filter.tags.not.length - 1, 1);
    }
    if (b.config.filter.tags.not.length === 0) {
      b.config.filter.tags.not = null;
    }
    onBlockUpdate(b);
    setNewTagsNot("");
  };

  const handleDataSourcesChange = (
    dataSources: { workspace_id: string; data_source_id: string }[]
  ) => {
    console.log("DS CHANGE", dataSources);
    const b = shallowBlockClone(block);
    b.config.data_sources = dataSources;
    onBlockUpdate(b);
  };

  const handleTopKChange = (top_k: string) => {
    const b = shallowBlockClone(block);
    b.config.top_k = top_k;
    onBlockUpdate(b);
  };

  const handleFullTextChange = (full_text: boolean) => {
    const b = shallowBlockClone(block);
    b.spec.full_text = full_text;
    onBlockUpdate(b);
  };

  const handleQueryChange = (query: string) => {
    const b = shallowBlockClone(block);
    b.spec.query = query;
    onBlockUpdate(b);
  };

  const handleFilterCodeChange = (filterCode: string) => {
    const b = shallowBlockClone(block);
    b.spec.filter_code = filterCode;
    onBlockUpdate(b);
  };

  return (
    <Block
      owner={owner}
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
            <div className="mr-1 flex flex-initial">Data Source:</div>
            <DataSourcePicker
              owner={owner}
              readOnly={readOnly}
              currentDataSources={block.config.data_sources || []}
              onDataSourcesUpdate={(dataSources) => {
                handleDataSourcesChange(dataSources);
              }}
            />
          </div>
          <div className="flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
            <div className="flex flex-initial">top k:</div>
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
          <div className="flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
            <div className="flex flex-initial">full text:</div>
            <div className="flex flex-initial font-normal">
              <input
                type="checkbox"
                className={classNames(
                  "ml-1 mr-4 h-4 w-4 rounded border-gray-300 bg-gray-100 text-action-600 focus:ring-2 focus:ring-white",
                  readOnly ? "" : "cursor-pointer"
                )}
                checked={block.spec.full_text || false}
                onClick={(e) => {
                  if (readOnly) {
                    e.preventDefault();
                  }
                }}
                onChange={(e) => {
                  handleFullTextChange(e.target.checked);
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col text-sm font-medium leading-8 text-gray-500">
          {filtersExpanded ? (
            <div
              onClick={() => setFiltersExpanded(false)}
              className="-ml-5 flex w-24 flex-initial cursor-pointer items-center font-bold"
            >
              <span>
                <ChevronDownIcon className="mr-1 mt-0.5 h-4 w-4" />
              </span>
              filters
            </div>
          ) : (
            <div
              onClick={() => setFiltersExpanded(true)}
              className="-ml-5 flex w-24 flex-initial cursor-pointer items-center font-bold"
            >
              <span>
                <ChevronRightIcon className="mr-1 mt-0.5 h-4 w-4" />
              </span>
              filters
            </div>
          )}
          {filtersExpanded ? (
            <div className="flex flex-col space-y-1">
              <div className="flex flex-col space-y-1 text-sm font-medium leading-8 text-gray-700">
                <div className="flex w-full font-normal">
                  <div className="w-full leading-4">
                    <div
                      className={classNames(
                        "border bg-slate-100",
                        "border-slate-100"
                      )}
                    >
                      <CodeEditor
                        data-color-mode="light"
                        readOnly={readOnly}
                        value={block.spec.filter_code}
                        language="js"
                        placeholder=""
                        onChange={(e) => handleFilterCodeChange(e.target.value)}
                        padding={15}
                        style={{
                          fontSize: 12,
                          fontFamily:
                            "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                          backgroundColor: "rgb(241 245 249)",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col xl:flex-row xl:space-x-2">
                <div className="flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
                  <div className="flex flex-initial">tags.in:</div>
                  <div className="flex w-full font-normal">
                    <div
                      className={classNames(
                        "flex flex-row items-center text-sm font-normal"
                      )}
                    >
                      <div className="flex flex-row items-center space-x-1">
                        {(block.config.filter?.tags?.in || []).map(
                          (tag: string, i: number) => (
                            <div
                              key={i}
                              className="flex rounded-md bg-slate-100 px-1"
                            >
                              {tag}
                              <span
                                onClick={() => handleRemoveTagsIn(i)}
                                className="ml-1 flex cursor-pointer items-center"
                              >
                                <XMarkIcon />
                              </span>
                            </div>
                          )
                        )}
                      </div>
                      {readOnly ? null : (
                        <input
                          type="text"
                          placeholder="add tag"
                          value={newTagsIn}
                          onChange={(e) => setNewTagsIn(e.target.value)}
                          className={classNames(
                            "ml-1 flex w-20 flex-1 rounded-md px-1 py-1 text-sm font-normal ring-0",
                            "placeholder-gray-300",
                            readOnly
                              ? "border-white ring-0 focus:border-white focus:ring-0"
                              : "border-gray-300 focus:border-gray-500 focus:ring-0"
                          )}
                          readOnly={readOnly}
                          onBlur={(e) => {
                            if (e.target.value.trim().length > 0) {
                              handleAddTagsIn(e.target.value);
                              e.preventDefault();
                            }
                          }}
                          onKeyDown={(e) => {
                            const tag = e.currentTarget.value;
                            if (
                              (e.key === "Tab" || e.key == "Enter") &&
                              tag.trim().length > 0
                            ) {
                              handleAddTagsIn(tag);
                              e.preventDefault();
                            }
                            if (
                              e.key === "Backspace" &&
                              newTagsIn.length === 0
                            ) {
                              handleRemoveTagsIn();
                            }
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
                  <div className="flex flex-initial">tags.not:</div>
                  <div className="flex w-full font-normal">
                    <div
                      className={classNames(
                        "flex flex-row items-center text-sm font-normal"
                      )}
                    >
                      <div className="flex flex-row items-center space-x-1">
                        {(block.config.filter?.tags?.not || []).map(
                          (tag: string, i: number) => (
                            <div
                              key={i}
                              className="flex rounded-md bg-slate-100 px-1"
                            >
                              {tag}
                              <span
                                onClick={() => handleRemoveTagsNot(i)}
                                className="ml-1 flex cursor-pointer items-center"
                              >
                                <XMarkIcon />
                              </span>
                            </div>
                          )
                        )}
                      </div>
                      {readOnly ? null : (
                        <input
                          type="text"
                          placeholder="add tag"
                          value={newTagsNot}
                          onChange={(e) => setNewTagsNot(e.target.value)}
                          className={classNames(
                            "ml-1 flex w-20 flex-1 rounded-md px-1 py-1 text-sm font-normal ring-0",
                            "placeholder-gray-300",
                            readOnly
                              ? "border-white ring-0 focus:border-white focus:ring-0"
                              : "border-gray-300 focus:border-gray-500 focus:ring-0"
                          )}
                          readOnly={readOnly}
                          onBlur={(e) => {
                            if (e.target.value.trim().length > 0) {
                              handleAddTagsNot(e.target.value);
                              e.preventDefault();
                            }
                          }}
                          onKeyDown={(e) => {
                            const tag = e.currentTarget.value;
                            if (
                              (e.key === "Tab" || e.key == "Enter") &&
                              tag.trim().length > 0
                            ) {
                              handleAddTagsNot(tag);
                              e.preventDefault();
                            }
                            if (
                              e.key === "Backspace" &&
                              newTagsNot.length === 0
                            ) {
                              handleRemoveTagsNot();
                            }
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
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
                  data-color-mode="light"
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
