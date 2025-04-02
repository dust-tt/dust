import {
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

import type { MCPServerType } from "@app/lib/actions/mcp_metadata";
import type { WorkspaceType } from "@app/types";

type ActionDetailsProps = {
  owner: WorkspaceType;
  onClose: () => void;
  mcpServer: MCPServerType | null;
};

export function InternalMCPServerDetails({
  mcpServer,
  onClose,
}: ActionDetailsProps) {
  return (
    <Sheet open={!!mcpServer} onOpenChange={onClose}>
      <SheetContent size="lg">
        <SheetHeader className="flex flex-col gap-5 pb-0 text-sm text-foreground dark:text-foreground-night">
          <VisuallyHidden>
            <SheetTitle />
          </VisuallyHidden>
        </SheetHeader>
        <SheetContainer className="flex flex-col gap-5 pt-6 text-sm text-foreground dark:text-foreground-night">
          {mcpServer?.name}
          {mcpServer?.tools.map((tool) => (
            <div key={tool.name}>
              {tool.name} {tool.description}
            </div>
          ))}
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
