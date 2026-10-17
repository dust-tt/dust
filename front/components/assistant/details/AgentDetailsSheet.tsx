import { LazyAgentDetailsBody } from "@app/components/assistant/details/LazyAgentDetailsBody";
import type { UserType, WorkspaceType } from "@app/types/user";
import { Sheet, SheetContent, SheetTitle } from "@dust-tt/sparkle";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

type AgentDetailsSheetProps = {
  owner: WorkspaceType;
  onClose: () => void;
  agentId: string | null;
  user: UserType;
};

export function AgentDetailsSheet({
  agentId,
  onClose,
  owner,
  user,
}: AgentDetailsSheetProps) {
  return (
    <Sheet open={!!agentId} onOpenChange={onClose}>
      <SheetContent size="xl" className="outline-hidden">
        <VisuallyHidden>
          <SheetTitle />
        </VisuallyHidden>
        <LazyAgentDetailsBody agentId={agentId} owner={owner} user={user} />
      </SheetContent>
    </Sheet>
  );
}
