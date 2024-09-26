import type { WorkspaceType } from "@dust-tt/types";
import type {
  AppType,
  SpecificationBlockType,
  SpecificationType,
} from "@dust-tt/types";
import type { BlockType, RunType } from "@dust-tt/types";
import TextareaAutosize from "react-textarea-autosize";

import Database from "@app/components/app/blocks/Database";
import DatabaseSchema from "@app/components/app/blocks/DatabaseSchema";

import Browser from "./blocks/Browser";
import Chat from "./blocks/Chat";
import Code from "./blocks/Code";
import Curl from "./blocks/Curl";
import Data from "./blocks/Data";
import DataSource from "./blocks/DataSource";
import Input from "./blocks/Input";
import LLM from "./blocks/LLM";
import { Map, Reduce } from "./blocks/MapReduce";
import Search from "./blocks/Search";
import { End, While } from "./blocks/WhileEnd";

export default function SpecRunView({
  owner,
  app,
  readOnly,
  isAdmin,
  showOutputs,
  spec,
  run,
  runRequested,
  handleSetBlock,
  handleDeleteBlock,
  handleMoveBlockUp,
  handleMoveBlockDown,
  handleNewBlock,
}: {
  owner: WorkspaceType;
  app: AppType;
  readOnly: boolean;
  isAdmin: boolean;
  showOutputs: boolean;
  spec: SpecificationType;
  run: RunType | null;
  runRequested: boolean;
  handleSetBlock: (idx: number, block: SpecificationBlockType) => void;
  handleDeleteBlock: (idx: number) => void;
  handleMoveBlockUp: (idx: number) => void;
  handleMoveBlockDown: (idx: number) => void;
  handleNewBlock: (
    idx: number | null,
    blockType: BlockType | "map_reduce" | "while_end"
  ) => void;
}) {
  return (
    <>
      {app.description && spec.length > 0 ? (
        <div className="mb-4 flex flex-auto">
          <div className="flex text-sm italic text-gray-400">
            {app.description}
          </div>
        </div>
      ) : null}

      {/* This is a hack to force loading the component before we render the LLM blocks.
          Otherwise the autoresize does not work on init?
          TODO(spolu): investigate */}
      <TextareaAutosize className="hidden" value="foo" />

      <div className="flex flex-col gap-y-4">
        {spec.map((block, idx) => {
          // Match status with block
          let status = null;
          if (
            run &&
            run.status &&
            idx < run.status.blocks.length &&
            run.status.blocks[idx].block_type == block.type &&
            run.status.blocks[idx].name == block.name
          ) {
            status = run.status.blocks[idx];
          }
          switch (block.type) {
            case "input":
              return (
                <Input
                  key={idx}
                  block={block}
                  owner={owner}
                  app={app}
                  spec={spec}
                  run={run}
                  status={status}
                  running={runRequested || run?.status.run == "running"}
                  readOnly={readOnly}
                  showOutputs={showOutputs}
                  onBlockUpdate={(block) => handleSetBlock(idx, block)}
                  onBlockDelete={() => handleDeleteBlock(idx)}
                  onBlockUp={() => handleMoveBlockUp(idx)}
                  onBlockDown={() => handleMoveBlockDown(idx)}
                  onBlockNew={(blockType) => handleNewBlock(idx, blockType)}
                />
              );

            case "data":
              return (
                <Data
                  key={idx}
                  block={block}
                  owner={owner}
                  app={app}
                  spec={spec}
                  run={run}
                  status={status}
                  running={runRequested || run?.status.run == "running"}
                  readOnly={readOnly}
                  showOutputs={showOutputs}
                  onBlockUpdate={(block) => handleSetBlock(idx, block)}
                  onBlockDelete={() => handleDeleteBlock(idx)}
                  onBlockUp={() => handleMoveBlockUp(idx)}
                  onBlockDown={() => handleMoveBlockDown(idx)}
                  onBlockNew={(blockType) => handleNewBlock(idx, blockType)}
                />
              );

            case "llm":
              return (
                <LLM
                  key={idx}
                  block={block}
                  owner={owner}
                  app={app}
                  spec={spec}
                  run={run}
                  status={status}
                  running={runRequested || run?.status.run == "running"}
                  readOnly={readOnly}
                  isAdmin={isAdmin}
                  showOutputs={showOutputs}
                  onBlockUpdate={(block) => handleSetBlock(idx, block)}
                  onBlockDelete={() => handleDeleteBlock(idx)}
                  onBlockUp={() => handleMoveBlockUp(idx)}
                  onBlockDown={() => handleMoveBlockDown(idx)}
                  onBlockNew={(blockType) => handleNewBlock(idx, blockType)}
                />
              );

            case "chat":
              return (
                <Chat
                  key={idx}
                  block={block}
                  owner={owner}
                  app={app}
                  spec={spec}
                  run={run}
                  status={status}
                  running={runRequested || run?.status.run == "running"}
                  readOnly={readOnly}
                  isAdmin={isAdmin}
                  showOutputs={showOutputs}
                  onBlockUpdate={(block) => handleSetBlock(idx, block)}
                  onBlockDelete={() => handleDeleteBlock(idx)}
                  onBlockUp={() => handleMoveBlockUp(idx)}
                  onBlockDown={() => handleMoveBlockDown(idx)}
                  onBlockNew={(blockType) => handleNewBlock(idx, blockType)}
                />
              );

            case "code":
              return (
                <Code
                  key={idx}
                  block={block}
                  owner={owner}
                  app={app}
                  spec={spec}
                  run={run}
                  status={status}
                  running={runRequested || run?.status.run == "running"}
                  readOnly={readOnly}
                  showOutputs={showOutputs}
                  onBlockUpdate={(block) => handleSetBlock(idx, block)}
                  onBlockDelete={() => handleDeleteBlock(idx)}
                  onBlockUp={() => handleMoveBlockUp(idx)}
                  onBlockDown={() => handleMoveBlockDown(idx)}
                  onBlockNew={(blockType) => handleNewBlock(idx, blockType)}
                />
              );

            case "data_source":
              return (
                <DataSource
                  key={idx}
                  block={block}
                  owner={owner}
                  app={app}
                  spec={spec}
                  run={run}
                  status={status}
                  running={runRequested || run?.status.run == "running"}
                  readOnly={readOnly}
                  showOutputs={showOutputs}
                  onBlockUpdate={(block) => handleSetBlock(idx, block)}
                  onBlockDelete={() => handleDeleteBlock(idx)}
                  onBlockUp={() => handleMoveBlockUp(idx)}
                  onBlockDown={() => handleMoveBlockDown(idx)}
                  onBlockNew={(blockType) => handleNewBlock(idx, blockType)}
                />
              );

            case "map":
              return (
                <Map
                  key={idx}
                  block={block}
                  owner={owner}
                  app={app}
                  spec={spec}
                  run={run}
                  status={status}
                  running={runRequested || run?.status.run == "running"}
                  readOnly={readOnly}
                  showOutputs={showOutputs}
                  onBlockUpdate={(block) => handleSetBlock(idx, block)}
                  onBlockDelete={() => handleDeleteBlock(idx)}
                  onBlockUp={() => handleMoveBlockUp(idx)}
                  onBlockDown={() => handleMoveBlockDown(idx)}
                  onBlockNew={(blockType) => handleNewBlock(idx, blockType)}
                />
              );

            case "reduce":
              return (
                <Reduce
                  key={idx}
                  block={block}
                  owner={owner}
                  app={app}
                  spec={spec}
                  run={run}
                  status={status}
                  running={runRequested || run?.status.run == "running"}
                  readOnly={readOnly}
                  showOutputs={showOutputs}
                  onBlockUpdate={(block) => handleSetBlock(idx, block)}
                  onBlockDelete={() => handleDeleteBlock(idx)}
                  onBlockUp={() => handleMoveBlockUp(idx)}
                  onBlockDown={() => handleMoveBlockDown(idx)}
                  onBlockNew={(blockType) => handleNewBlock(idx, blockType)}
                />
              );

            case "while":
              return (
                <While
                  key={idx}
                  block={block}
                  owner={owner}
                  app={app}
                  spec={spec}
                  run={run}
                  status={status}
                  running={runRequested || run?.status.run == "running"}
                  readOnly={readOnly}
                  showOutputs={showOutputs}
                  onBlockUpdate={(block) => handleSetBlock(idx, block)}
                  onBlockDelete={() => handleDeleteBlock(idx)}
                  onBlockUp={() => handleMoveBlockUp(idx)}
                  onBlockDown={() => handleMoveBlockDown(idx)}
                  onBlockNew={(blockType) => handleNewBlock(idx, blockType)}
                />
              );

            case "end":
              return (
                <End
                  key={idx}
                  block={block}
                  owner={owner}
                  app={app}
                  spec={spec}
                  run={run}
                  status={status}
                  running={runRequested || run?.status.run == "running"}
                  readOnly={readOnly}
                  showOutputs={showOutputs}
                  onBlockUpdate={(block) => handleSetBlock(idx, block)}
                  onBlockDelete={() => handleDeleteBlock(idx)}
                  onBlockUp={() => handleMoveBlockUp(idx)}
                  onBlockDown={() => handleMoveBlockDown(idx)}
                  onBlockNew={(blockType) => handleNewBlock(idx, blockType)}
                />
              );

            case "search":
              return (
                <Search
                  key={idx}
                  block={block}
                  owner={owner}
                  app={app}
                  spec={spec}
                  run={run}
                  status={status}
                  running={runRequested || run?.status.run == "running"}
                  readOnly={readOnly}
                  isAdmin={isAdmin}
                  showOutputs={showOutputs}
                  onBlockUpdate={(block) => handleSetBlock(idx, block)}
                  onBlockDelete={() => handleDeleteBlock(idx)}
                  onBlockUp={() => handleMoveBlockUp(idx)}
                  onBlockDown={() => handleMoveBlockDown(idx)}
                  onBlockNew={(blockType) => handleNewBlock(idx, blockType)}
                />
              );

            case "curl":
              return (
                <Curl
                  key={idx}
                  block={block}
                  owner={owner}
                  app={app}
                  spec={spec}
                  run={run}
                  status={status}
                  running={runRequested || run?.status.run == "running"}
                  readOnly={readOnly}
                  showOutputs={showOutputs}
                  onBlockUpdate={(block) => handleSetBlock(idx, block)}
                  onBlockDelete={() => handleDeleteBlock(idx)}
                  onBlockUp={() => handleMoveBlockUp(idx)}
                  onBlockDown={() => handleMoveBlockDown(idx)}
                  onBlockNew={(blockType) => handleNewBlock(idx, blockType)}
                />
              );

            case "browser":
              return (
                <Browser
                  key={idx}
                  block={block}
                  owner={owner}
                  app={app}
                  spec={spec}
                  run={run}
                  status={status}
                  running={runRequested || run?.status.run == "running"}
                  readOnly={readOnly}
                  isAdmin={isAdmin}
                  showOutputs={showOutputs}
                  onBlockUpdate={(block) => handleSetBlock(idx, block)}
                  onBlockDelete={() => handleDeleteBlock(idx)}
                  onBlockUp={() => handleMoveBlockUp(idx)}
                  onBlockDown={() => handleMoveBlockDown(idx)}
                  onBlockNew={(blockType) => handleNewBlock(idx, blockType)}
                />
              );

            case "database_schema":
              return (
                <DatabaseSchema
                  key={idx}
                  block={block}
                  owner={owner}
                  app={app}
                  spec={spec}
                  run={run}
                  status={status}
                  running={runRequested || run?.status.run == "running"}
                  readOnly={readOnly}
                  showOutputs={showOutputs}
                  onBlockUpdate={(block) => handleSetBlock(idx, block)}
                  onBlockDelete={() => handleDeleteBlock(idx)}
                  onBlockUp={() => handleMoveBlockUp(idx)}
                  onBlockDown={() => handleMoveBlockDown(idx)}
                  onBlockNew={(blockType) => handleNewBlock(idx, blockType)}
                />
              );

            case "database":
              return (
                <Database
                  key={idx}
                  block={block}
                  owner={owner}
                  app={app}
                  spec={spec}
                  run={run}
                  status={status}
                  running={runRequested || run?.status.run == "running"}
                  readOnly={readOnly}
                  showOutputs={showOutputs}
                  onBlockUpdate={(block) => handleSetBlock(idx, block)}
                  onBlockDelete={() => handleDeleteBlock(idx)}
                  onBlockUp={() => handleMoveBlockUp(idx)}
                  onBlockDown={() => handleMoveBlockDown(idx)}
                  onBlockNew={(blockType) => handleNewBlock(idx, blockType)}
                />
              );

            default:
              return ((t: never) => (
                <div key={idx} className="flex flex-row px-4 py-4 text-sm">
                  Unknown block type: {t}
                </div>
              ))(block.type);
          }
        })}
      </div>
    </>
  );
}
