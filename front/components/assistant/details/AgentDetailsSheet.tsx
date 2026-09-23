import { AgentDetailsBody } from "@app/components/assistant/details/AgentDetailsBody";
import type { UserType, WorkspaceType } from "@app/types/user";
import { Sheet, SheetContent, SheetTitle } from "@dust-tt/sparkle";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

export { SCOPE_INFO } from "@app/components/assistant/details/AgentDetailsBody";

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
        <AgentDetailsBody agentId={agentId} owner={owner} user={user} />
      </SheetContent>
    </Sheet>
  );
}
