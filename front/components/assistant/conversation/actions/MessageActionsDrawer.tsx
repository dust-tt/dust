import { Modal, Page } from "@dust-tt/sparkle";
import type { AgentActionType } from "@dust-tt/types";

import { AgentAction } from "@app/components/assistant/conversation/AgentAction";

interface MessageActionsDrawerProps {
  actions: AgentActionType[];
  isOpened: boolean;
  onClose: () => void;
}

export function MessageActionsDrawer({
  actions,
  isOpened,
  onClose,
}: MessageActionsDrawerProps) {
  return (
    <Modal
      isOpen={isOpened}
      onClose={onClose}
      title="Actions Details"
      variant="side-sm"
      hasChanged={false}
    >
      <Page variant="modal">
        <Page.Layout direction="vertical">
          <div className="h-full w-full overflow-visible">
            {actions.map((action) => (
              <AgentAction action={action} key={`action-${action.id}`} />
            ))}
          </div>
        </Page.Layout>
      </Page>
    </Modal>
  );
}
