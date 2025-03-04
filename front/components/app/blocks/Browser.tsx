import {
  Button,
  Checkbox,
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

import { filterServiceProviders } from "@app/lib/providers";
import { useProviders } from "@app/lib/swr/apps";
import { shallowBlockClone } from "@app/lib/utils";

import Block from "./Block";

export default function Browser({
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
  const browserlessAPIProvider = serviceProviders.find(
    (p) => p.providerId == "browserlessapi"
  );

  // Update the config to impact run state based on the BrowserlessAPI provider presence.
  if (!readOnly && !isProvidersLoading && !isProvidersError) {
    if (
      (!block.config.provider_id || block.config.provider_id.length == 0) &&
      browserlessAPIProvider
    ) {
      setTimeout(() => {
        const b = shallowBlockClone(block);
        b.config.provider_id = "browserlessapi";
        onBlockUpdate(b);
      });
    }
    if (
      block.config.provider_id &&
      block.config.provider_id.length > 0 &&
      !browserlessAPIProvider
    ) {
      setTimeout(() => {
        const b = shallowBlockClone(block);
        b.config.provider_id = "";
        onBlockUpdate(b);
      });
    }
  }

  const handleUrlChange = (url: string) => {
    const b = shallowBlockClone(block);
    b.spec.url = url;
    onBlockUpdate(b);
  };

  const handleSelectorChange = (selector: string) => {
    const b = shallowBlockClone(block);
    b.spec.selector = selector;
    onBlockUpdate(b);
  };

  const handleTimeoutChange = (timeout: string) => {
    const b = shallowBlockClone(block);
    b.spec.timeout = timeout;
    onBlockUpdate(b);
  };

  const handleWaitUntilChange = (wait_until: string) => {
    const b = shallowBlockClone(block);
    b.spec.wait_until = wait_until;
    onBlockUpdate(b);
  };

  const handleWaitForChange = (wait_for: string) => {
    const b = shallowBlockClone(block);
    b.spec.wait_for = wait_for;
    onBlockUpdate(b);
  };

  const handleErrorAsOutputChange = (error_as_output: boolean) => {
    const b = shallowBlockClone(block);
    b.config.error_as_output = error_as_output;
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
      <div className="flex w-full flex-col gap-4 pt-2 text-sm">
        <div className="flex w-full flex-col gap-2">
          <div className="flex flex-row items-center gap-2">
            <Label>URL (with scheme)</Label>
            {!isProvidersLoading && !browserlessAPIProvider && !readOnly && (
              <div className="px-2">
                <Button
                  href={`/w/${owner.sId}/developers/providers`}
                  variant="warning"
                  label={
                    isAdmin
                      ? "Setup Browserless API"
                      : "Browserless API not available"
                  }
                  readOnly={!isAdmin}
                  size="xs"
                />
              </div>
            )}
          </div>
          <Input
            type="text"
            placeholder=""
            spellCheck={false}
            readOnly={readOnly}
            value={block.spec.url}
            onChange={(e) => handleUrlChange(e.target.value)}
          />
        </div>

        <div className="flex w-full flex-col gap-2">
          <Label>CSS selector</Label>
          <Input
            type="text"
            placeholder=""
            readOnly={readOnly}
            value={block.spec.selector}
            onChange={(e) => handleSelectorChange(e.target.value)}
          />
        </div>

        <CollapsibleComponent
          rootProps={{ defaultOpen: false }}
          triggerProps={{ label: "Advanced" }}
          contentChildren={
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex items-center space-x-2">
                <Label className="whitespace-nowrap">Error as output</Label>
                <Checkbox
                  checked={block.config.error_as_output}
                  onCheckedChange={(checked) =>
                    handleErrorAsOutputChange(!!checked)
                  }
                  disabled={readOnly}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Label className="whitespace-nowrap">Timeout</Label>
                <Input
                  type="text"
                  readOnly={readOnly}
                  spellCheck={false}
                  value={block.spec.timeout}
                  onChange={(e) => handleTimeoutChange(e.target.value)}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Label className="whitespace-nowrap">Wait until</Label>
                <Input
                  type="text"
                  spellCheck={false}
                  readOnly={readOnly}
                  value={block.spec.wait_until}
                  onChange={(e) => handleWaitUntilChange(e.target.value)}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Label className="whitespace-nowrap">Wait for</Label>
                <Input
                  type="text"
                  placeholder=""
                  spellCheck={false}
                  readOnly={readOnly}
                  value={block.spec.wait_for}
                  onChange={(e) => handleWaitForChange(e.target.value)}
                />
              </div>
            </div>
          }
        />
      </div>
    </Block>
  );
}
