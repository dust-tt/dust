import "@uiw/react-textarea-code-editor/dist.css";

import { SuspensedCodeEditor } from "@app/components/SuspensedCodeEditor";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { classNames, shallowBlockClone } from "@app/lib/utils";
import type {
  AppType,
  SpecificationBlockType,
  SpecificationType,
} from "@app/types/app";
import type { BlockType, RunType } from "@app/types/run";
import type { WorkspaceType } from "@app/types/user";

import Block from "./Block";

export function While({
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
  const handleConditionCodeChange = (conditionCode: string) => {
    const b = shallowBlockClone(block);
    b.spec.condition_code = conditionCode;
    onBlockUpdate(b);
  };

  const handleMaxIterationsChange = (maxIterations: string) => {
    const b = shallowBlockClone(block);
    b.spec.max_iterations = maxIterations;
    onBlockUpdate(b);
  };

  const { isDark } = useTheme();

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
      <div className="mx-4 flex w-full flex-col">
        <div className="flex flex-col lg:flex-row lg:space-x-4">
          <div className="flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
            <div className="flex flex-initial">max_iterations:</div>
            <div className="flex flex-initial font-normal">
              <input
                type="text"
                className={classNames(
                  "block w-8 flex-1 rounded-md px-1 py-1 text-sm font-normal",
                  readOnly
                    ? "border-white ring-0 focus:border-white focus:ring-0"
                    : "border-white focus:border-gray-300 focus:ring-0"
                )}
                spellCheck={false}
                readOnly={readOnly}
                value={block.spec.max_iterations}
                onChange={(e) => handleMaxIterationsChange(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col space-y-1 text-sm font-medium leading-8 text-gray-700">
          <div className="flex flex-initial items-center">condition :</div>
          <div className="flex w-full font-normal">
            <div className="w-full leading-4">
              <SuspensedCodeEditor
                data-color-mode={isDark ? "dark" : "light"}
                readOnly={readOnly}
                value={block.spec.condition_code}
                language="js"
                placeholder=""
                onChange={(e) => handleConditionCodeChange(e.target.value)}
                padding={15}
                className="rounded-lg bg-muted-background dark:bg-muted-background-night"
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

export function End({
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
    ></Block>
  );
}
