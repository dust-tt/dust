import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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

import { filterServiceProviders } from "@app/lib/providers";
import { useProviders } from "@app/lib/swr/apps";
import { classNames, shallowBlockClone } from "@app/lib/utils";

import Block from "./Block";

export default function Search({
  owner,
  app,
  spec,
  run,
  block,
  status,
  running,
  readOnly,
  isAdmin,
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
  isAdmin: boolean;
  showOutputs: boolean;
  onBlockUpdate: (block: SpecificationBlockType) => void;
  onBlockDelete: () => void;
  onBlockUp: () => void;
  onBlockDown: () => void;
  onBlockNew: (blockType: BlockType | "map_reduce" | "while_end") => void;
}>) {
  const { providers, isProvidersLoading, isProvidersError } = useProviders({
    owner,
    disabled: readOnly,
  });
  const serviceProviders = filterServiceProviders(providers);
  const searchProviders = serviceProviders?.filter?.(
    (p) => p.providerId === "serpapi" || p.providerId === "serper"
  );

  const currentProvider = searchProviders?.find?.(
    (p) => p.providerId === block.config.provider_id
  );

  // Update the config to impact run state based on the serpAPI provider presence.
  if (!readOnly && !isProvidersLoading && !isProvidersError) {
    if (!!block.config.provider_id && !currentProvider) {
      setTimeout(() => {
        const b = shallowBlockClone(block);
        b.config.provider_id = "";
        onBlockUpdate(b);
      });
    }
  }

  const handleQueryChange = (query: string) => {
    const b = shallowBlockClone(block);
    b.spec.query = query;
    onBlockUpdate(b);
  };

  const handleNumChange = (num: string) => {
    const b = shallowBlockClone(block);
    b.spec.num = num;
    onBlockUpdate(b);
  };

  const handleSelectProvider = (providerId: string) => {
    const b = shallowBlockClone(block);
    b.config.provider_id = providerId;
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
      showOutputs={showOutputs}
      canUseCache={true}
      onBlockUpdate={onBlockUpdate}
      onBlockDelete={onBlockDelete}
      onBlockUp={onBlockUp}
      onBlockDown={onBlockDown}
      onBlockNew={onBlockNew}
    >
      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
          <div className="flex flex-initial">provider:</div>
          {/* Owner has zero search providers */}
          {!isProvidersLoading &&
            !readOnly &&
            searchProviders?.length === 0 && (
              <div className="px-2">
                {searchProviders?.length === 0 &&
                  (isAdmin ? (
                    <Button
                      variant="outline"
                      href={`/w/${owner.sId}/developers/providers?t=providers`}
                      label="Setup provider"
                      disabled={readOnly}
                    />
                  ) : (
                    <div
                      className={classNames(
                        "inline-flex items-center rounded-md py-1 text-sm font-normal",
                        "border px-3",
                        "border-white text-gray-300"
                      )}
                    >
                      Provider not available
                    </div>
                  ))}
              </div>
            )}

          {!isProvidersLoading && !readOnly && searchProviders?.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  isSelect
                  variant="outline"
                  label={currentProvider?.providerId ?? "Select provider"}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {(searchProviders || []).map((p) => (
                  <DropdownMenuItem
                    key={p.providerId}
                    label={p.providerId}
                    onClick={() => handleSelectProvider(p.providerId)}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label>Num</Label>
          <Input
            type="text"
            placeholder=""
            readOnly={readOnly}
            value={block.spec.num}
            onChange={(e) => handleNumChange(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Query</Label>

          <Input
            type="text"
            placeholder=""
            readOnly={readOnly}
            value={block.spec.query}
            onChange={(e) => handleQueryChange(e.target.value)}
          />
        </div>
      </div>
    </Block>
  );
}
