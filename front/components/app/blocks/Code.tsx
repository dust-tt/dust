import "@uiw/react-textarea-code-editor/dist.css";

import { Label } from "@dust-tt/sparkle";
import dynamic from "next/dynamic";

import { shallowBlockClone } from "@app/lib/utils";
import type { WorkspaceType } from "@app/types";
import type {
  AppType,
  SpecificationBlockType,
  SpecificationType,
} from "@app/types";
import type { BlockType, RunType } from "@app/types";

import Block from "./Block";

const CodeEditor = dynamic(
  () => import("@uiw/react-textarea-code-editor").then((mod) => mod.default),
  { ssr: false }
);

export default function Code({
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
  const handleCodeChange = (code: string) => {
    const b = shallowBlockClone(block);
    b.spec.code = code;
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
      onBlockUpdate={onBlockUpdate}
      onBlockDelete={onBlockDelete}
      onBlockUp={onBlockUp}
      onBlockDown={onBlockDown}
      onBlockNew={onBlockNew}
      canUseCache={false}
    >
      <div className="flex w-full flex-col pt-2">
        <div className="flex flex-col gap-2 text-sm">
          <Label>Code</Label>
          <div className="flex w-full font-normal">
            <div className="w-full">
              <CodeEditor
                data-color-mode={theme === "dark" ? "dark" : "light"}
                readOnly={readOnly}
                value={block.spec.code}
                language="js"
                placeholder=""
                onChange={(e) => handleCodeChange(e.target.value)}
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
          </div>
        </div>
      </div>
    </Block>
  );
}
