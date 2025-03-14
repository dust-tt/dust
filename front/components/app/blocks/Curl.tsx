import "@uiw/react-textarea-code-editor/dist.css";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
} from "@dust-tt/sparkle";
import dynamic from "next/dynamic";
import { useEffect } from "react";

import { shallowBlockClone } from "@app/lib/utils";
import type {
  AppType,
  BlockType,
  RunType,
  SpecificationBlockType,
  SpecificationType,
  WorkspaceType,
} from "@app/types";

import Block from "./Block";

const CodeEditor = dynamic(
  () => import("@uiw/react-textarea-code-editor").then((mod) => mod.default),
  { ssr: false }
);

export default function Curl({
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
  const availableMethods = ["GET", "POST", "PUT", "PATCH"];

  const handleSchemeChange = (scheme: string) => {
    const b = shallowBlockClone(block);
    b.spec.scheme = scheme;
    onBlockUpdate(b);
  };

  const handleHeadersCodeChange = (headersCode: string) => {
    const b = shallowBlockClone(block);
    b.spec.headers_code = headersCode;
    onBlockUpdate(b);
  };

  const handleBodyCodeChange = (bodyCode: string) => {
    const b = shallowBlockClone(block);
    b.spec.body_code = bodyCode;
    onBlockUpdate(b);
  };

  const handleUrlChange = (url: string) => {
    const b = shallowBlockClone(block);
    // if url begins with http:// or https://, remove it
    if (url.startsWith("http://")) {
      url = url.substring(7);
      b.spec.scheme = "http";
    }
    if (url.startsWith("https://")) {
      url = url.substring(8);
      b.spec.scheme = "https";
    }
    b.spec.url = url;
    onBlockUpdate(b);
  };

  const handleMethodChange = (method: string) => {
    const b = shallowBlockClone(block);
    b.spec.method = method;
    onBlockUpdate(b);
  };

  useEffect(() => {
    if (!block.spec.scheme) {
      handleSchemeChange("https");
    }
  });

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
      canUseCache={true}
      onBlockUpdate={onBlockUpdate}
      onBlockDelete={onBlockDelete}
      onBlockUp={onBlockUp}
      onBlockDown={onBlockDown}
      onBlockNew={onBlockNew}
    >
      <div className="flex w-full flex-col gap-4 pt-2">
        <div className="flex flex-row gap-2">
          <div className="flex flex-row items-center space-x-1 text-sm">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  isSelect
                  variant="outline"
                  disabled={readOnly}
                  label={block.spec.method}
                  size="xs"
                />
              </DropdownMenuTrigger>

              {!readOnly && (
                <DropdownMenuContent className="mt-1" align="start">
                  {availableMethods.map((method) => (
                    <DropdownMenuItem
                      key={method}
                      label={method}
                      onClick={() => handleMethodChange(method)}
                    />
                  ))}
                </DropdownMenuContent>
              )}
            </DropdownMenu>
          </div>
          <div className="flex w-full flex-1 flex-row items-center gap-2 text-sm font-medium">
            <div className="flex flex-1 font-normal">
              <div className="flex flex-1 rounded-md">
                <Button
                  variant="ghost-secondary"
                  size="sm"
                  disabled={readOnly}
                  className="rounded-l-md rounded-r-none border border-r-0"
                  onClick={() => {
                    if (!readOnly) {
                      handleSchemeChange(
                        block.spec.scheme === "https" ? "http" : "https"
                      );
                    }
                  }}
                  label={`${block.spec.scheme}://`}
                />
                <Input
                  className="h-full flex-1 rounded-l-none"
                  readOnly={readOnly}
                  value={block.spec.url}
                  onChange={(e) => handleUrlChange(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <Label>Headers</Label>
          <div className="flex w-full font-normal">
            <div className="w-full">
              <CodeEditor
                data-color-mode="light"
                readOnly={readOnly}
                value={block.spec.headers_code}
                language="js"
                placeholder=""
                onChange={(e) => handleHeadersCodeChange(e.target.value)}
                padding={15}
                className="rounded-lg bg-slate-100 dark:bg-slate-100-night"
                style={{
                  fontSize: 12,
                  fontFamily:
                    "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                }}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <Label>Body</Label>
          <div className="flex w-full font-normal">
            <div className="w-full">
              <CodeEditor
                data-color-mode={theme === "dark" ? "dark" : "light"}
                readOnly={readOnly}
                value={block.spec.body_code}
                language="js"
                placeholder=""
                onChange={(e) => handleBodyCodeChange(e.target.value)}
                padding={15}
                className="rounded-lg bg-slate-100 dark:bg-slate-100-night"
                style={{
                  fontSize: 12,
                  fontFamily:
                    "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </Block>
  );
}
