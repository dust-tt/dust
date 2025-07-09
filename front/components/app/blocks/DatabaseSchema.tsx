import "@uiw/react-textarea-code-editor/dist.css";

import { TablesManager } from "@app/components/app/blocks/Database";
import type { WorkspaceType } from "@app/types";
import type {
  AppType,
  SpecificationBlockType,
  SpecificationType,
} from "@app/types";
import type { BlockType, RunType } from "@app/types";

import Block from "./Block";

export default function DatabaseSchema({
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
      canUseCache={false}
      onBlockUpdate={onBlockUpdate}
      onBlockDelete={onBlockDelete}
      onBlockUp={onBlockUp}
      onBlockDown={onBlockDown}
      onBlockNew={onBlockNew}
    >
      <div className="mx-4 flex w-full flex-col gap-2">
        <TablesManager
          owner={owner}
          app={app}
          block={block}
          readOnly={readOnly}
          onBlockUpdate={onBlockUpdate}
        />
      </div>
    </Block>
  );
}
