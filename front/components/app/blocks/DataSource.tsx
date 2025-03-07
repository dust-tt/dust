import "@uiw/react-textarea-code-editor/dist.css";

import {
  Checkbox,
  Chip,
  CollapsibleComponent,
  Input,
  Label,
} from "@dust-tt/sparkle";
import type {
  AppType,
  BlockType,
  RunType,
  SpecificationBlockType,
  SpecificationType,
  WorkspaceType,
} from "@dust-tt/types";
import dynamic from "next/dynamic";
import { useState } from "react";

import DataSourcePicker from "@app/components/data_source/DataSourcePicker";
import { shallowBlockClone } from "@app/lib/utils";

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
  showOutputs,
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
  showOutputs: boolean;
  onBlockUpdate: (block: SpecificationBlockType) => void;
  onBlockDelete: () => void;
  onBlockUp: () => void;
  onBlockDown: () => void;
  onBlockNew: (blockType: BlockType | "map_reduce" | "while_end") => void;
}>) {
  const [newTagsIn, setNewTagsIn] = useState("");
  const [newTagsNot, setNewTagsNot] = useState("");

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

  const theme = localStorage.getItem("theme");

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
      showOutputs={showOutputs}
      canUseCache={false}
      onBlockUpdate={onBlockUpdate}
      onBlockDelete={onBlockDelete}
      onBlockUp={onBlockUp}
      onBlockDown={onBlockDown}
      onBlockNew={onBlockNew}
    >
      <div className="flex w-full flex-col gap-2">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center space-x-2">
            <Label>Data Source</Label>
            <DataSourcePicker
              owner={owner}
              readOnly={readOnly}
              currentDataSources={block.config.data_sources || []}
              space={app.space}
              onDataSourcesUpdate={(dataSources) => {
                handleDataSourcesChange(dataSources);
              }}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Label>Top K</Label>
            <div className="flex flex-initial font-normal">
              <Input
                type="text"
                readOnly={readOnly}
                value={block.config.top_k}
                onChange={(e) => handleTopKChange(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Label>Full Text</Label>
            <div className="flex flex-initial font-normal">
              <Checkbox
                checked={block.spec.full_text || false}
                onCheckedChange={(checked) => handleFullTextChange(!!checked)}
                disabled={readOnly}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col space-y-1">
          <Label>Query</Label>
          <div className="flex w-full font-normal">
            <div className="w-full leading-5">
              <CodeEditor
                data-color-mode={theme === "dark" ? "dark" : "light"}
                readOnly={readOnly}
                value={block.spec.query}
                language="jinja2"
                placeholder=""
                onChange={(e) => handleQueryChange(e.target.value)}
                padding={3}
                minHeight={80}
                className="rounded-lg bg-slate-100 dark:bg-slate-100-night"
                style={{
                  color: "rgb(55 65 81)",
                  fontSize: 13,
                  fontFamily:
                    "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                }}
              />
            </div>
          </div>
        </div>

        <div className="w-full">
          <CollapsibleComponent
            rootProps={{ defaultOpen: false }}
            triggerProps={{ label: "Filters" }}
            contentChildren={
              <div className="flex w-full flex-col gap-2">
                <div className="flex w-full flex-col gap-2">
                  <CodeEditor
                    data-color-mode={theme === "dark" ? "dark" : "light"}
                    readOnly={readOnly}
                    value={block.spec.filter_code}
                    language="js"
                    placeholder=""
                    onChange={(e) => handleFilterCodeChange(e.target.value)}
                    padding={15}
                    minHeight={80}
                    className="rounded-lg bg-slate-100 dark:bg-slate-100-night"
                    style={{
                      fontSize: 12,
                      fontFamily:
                        "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                    }}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex flex-initial flex-row items-center gap-2">
                    <Label>tags.in</Label>
                    <div className="flex w-full">
                      <div className="flex flex-row items-center gap-1">
                        {!readOnly && (
                          <Input
                            type="text"
                            placeholder="add tag"
                            value={newTagsIn}
                            onChange={(e) => setNewTagsIn(e.target.value)}
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
                        <div className="flex flex-row gap-1">
                          {(block.config.filter?.tags?.in || []).map(
                            (tag: string, i: number) => (
                              <Chip
                                key={i}
                                label={tag}
                                onRemove={() => handleRemoveTagsIn(i)}
                                color="slate"
                              />
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-initial flex-row items-center gap-2">
                    <Label>tags.not</Label>
                    <div className="flex w-full">
                      <div className="flex flex-row items-center gap-1">
                        {!readOnly && (
                          <Input
                            type="text"
                            placeholder="add tag"
                            value={newTagsNot}
                            onChange={(e) => setNewTagsNot(e.target.value)}
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
                        <div className="flex flex-row items-center">
                          <div className="flex flex-row gap-1">
                            {(block.config.filter?.tags?.not || []).map(
                              (tag: string, i: number) => (
                                <Chip
                                  key={i}
                                  label={tag}
                                  onRemove={() => handleRemoveTagsNot(i)}
                                  color="slate"
                                />
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            }
          />
        </div>
      </div>
    </Block>
  );
}
