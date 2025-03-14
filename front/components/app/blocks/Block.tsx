import {
  ArrowPathIcon,
  Button,
  ChevronDownIcon,
  ChevronUpIcon,
  Chip,
  Input,
  Spinner,
  Square3Stack3DIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import NewBlock from "@app/components/app/NewBlock";
import { classNames } from "@app/lib/utils";
import type {
  AppType,
  BlockType,
  RunType,
  SpecificationBlockType,
  SpecificationType,
  WorkspaceType,
} from "@app/types";

import Output from "./Output";

export default function Block({
  owner,
  app,
  spec,
  run,
  block,
  status,
  running,
  readOnly,
  showOutputs,
  children,
  canUseCache,
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
  canUseCache: boolean;
  onBlockUpdate: (block: SpecificationBlockType) => void;
  onBlockDelete: () => void;
  onBlockUp: () => void;
  onBlockDown: () => void;
  onBlockNew: (blockType: BlockType | "map_reduce" | "while_end") => void;
}>) {
  const handleNameChange = (name: string) => {
    const b = Object.assign({}, block);
    b.name = name;
    onBlockUpdate(b);
  };

  const handleUseCacheChange = (useCache: boolean) => {
    const b = Object.assign({}, block);
    b.config.use_cache = useCache;
    onBlockUpdate(b);
  };

  const [nameError, setNameError] = useState("");

  const nameValidation = (name: string) => {
    let valid = true;
    if (!name.match(/^[A-Z0-9_]+$/)) {
      setNameError(
        "Block name must only contain uppercase letters, numbers, and the character `_`."
      );
      valid = false;
    } else {
      setNameError("");
    }
    return valid;
  };

  useEffect(() => {
    nameValidation(block.name);
    if (canUseCache && block.config.use_cache === undefined) {
      handleUseCacheChange(true);
    }
  });

  return (
    <div>
      <div
        className={classNames(
          block.indent == 1 ? "ml-8" : "ml-0",
          "border-border-dark dark:border-border-dark-night",
          "flex flex-col rounded-2xl border px-4 py-4"
        )}
      >
        <div className="flex w-full flex-row items-start justify-between pb-2">
          <div className="flex flex-row items-start gap-2">
            <Chip label={block.type} color="slate" size="sm" />
            <Input
              placeholder="BLOCK_NAME"
              readOnly={readOnly}
              value={block.name}
              messageStatus={nameError != "" ? "error" : undefined}
              message={nameError}
              onChange={(e) => handleNameChange(e.target.value.toUpperCase())}
            />
          </div>

          <div className="flex flex-row items-start gap-1">
            {!readOnly && canUseCache && (
              <Button
                tooltip={
                  block.config && block.config.use_cache
                    ? "Results are cached (faster)"
                    : "Results are computed at each run"
                }
                variant="ghost-secondary"
                size="mini"
                icon={
                  block.config && block.config.use_cache
                    ? Square3Stack3DIcon
                    : ArrowPathIcon
                }
                onClick={() => handleUseCacheChange(!block.config?.use_cache)}
              />
            )}

            {!readOnly && (
              <>
                <NewBlock
                  disabled={readOnly}
                  onClick={onBlockNew}
                  spec={spec}
                  small={true}
                />
                <Button
                  variant="ghost-secondary"
                  icon={ChevronUpIcon}
                  onClick={onBlockUp}
                  size="mini"
                />
                <Button
                  variant="ghost-secondary"
                  icon={ChevronDownIcon}
                  onClick={onBlockDown}
                  size="mini"
                />
                <Button
                  variant="ghost-secondary"
                  icon={TrashIcon}
                  onClick={onBlockDelete}
                  size="mini"
                />
              </>
            )}
          </div>
        </div>
        <div className="flex">{children}</div>
      </div>

      <div className={classNames(block.indent == 1 ? "ml-8" : "ml-0", "py-1")}>
        {status &&
        status.status == "running" &&
        !["map", "reduce", "end"].includes(block.type) ? (
          <div
            className={classNames(
              "flex flex-row items-center text-sm",
              "text-primary-500 dark:text-primary-500-night"
            )}
          >
            <div className="ml-2 mr-2">
              <Spinner size="xs" variant="color" />
            </div>
            {` ${status.success_count} successes ${status.error_count} errors`}
          </div>
        ) : running && !(status && status.status != "running") ? (
          <div
            className={classNames(
              "flex flex-row items-center text-sm",
              "text-primary-500 dark:text-primary-500-night"
            )}
          >
            <div role="status">
              <div className="ml-2 mr-2">
                <Spinner size="xs" variant="color" />
              </div>
            </div>
            {` 0 successes 0 errors`}
          </div>
        ) : null}
        {status && status.status != "running" && run && showOutputs ? (
          <Output owner={owner} runId={run.run_id} block={block} app={app} />
        ) : null}
      </div>
    </div>
  );
}
