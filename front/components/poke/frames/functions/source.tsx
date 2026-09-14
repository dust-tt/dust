import { usePokeFrameFunctionSource } from "@app/poke/swr/frame_function_details";
import type { LightWorkspaceType } from "@app/types/user";
import {
  CodeBlock,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContentMessageInline,
  Label,
  Spinner,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface FrameFunctionSourceProps {
  functionId: string;
  owner: LightWorkspaceType;
  frameId: string;
}

export function FrameFunctionSource({
  functionId,
  owner,
  frameId,
}: FrameFunctionSourceProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { source, isLoading, isError } = usePokeFrameFunctionSource({
    owner,
    frameId,
    functionId,
    disabled: !isOpen,
  });

  return (
    <div className="my-4 flex flex-col rounded-lg border bg-background">
      <div className="flex justify-between gap-3 rounded-t-lg border-b border-separator bg-background p-4">
        <h2 className="text-md font-bold">Bundle</h2>
      </div>
      <div className="flex flex-col p-4">
        <Collapsible defaultOpen={false} onOpenChange={setIsOpen}>
          <CollapsibleTrigger>
            <Label className="cursor-pointer">Published source</Label>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {isLoading ? (
              <div className="flex items-center gap-2 pt-2">
                <Spinner size="sm" />
                <span className="text-sm text-muted-foreground">
                  Loading source...
                </span>
              </div>
            ) : isError || source === null ? (
              <ContentMessageInline variant="warning" className="mt-2">
                Unable to load the published bundle.
              </ContentMessageInline>
            ) : (
              <CodeBlock
                wrapLongLines
                className="language-typescript mt-2 max-h-[32rem] overflow-auto"
              >
                {source}
              </CodeBlock>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
