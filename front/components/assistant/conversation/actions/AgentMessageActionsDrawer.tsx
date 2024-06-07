import { Modal, Page } from "@dust-tt/sparkle";
import type { AgentActionType } from "@dust-tt/types";

import { getActionSpecification } from "@app/components/actions/types";

interface AgentMessageActionsDrawerProps {
  actions: AgentActionType[];
  isOpened: boolean;
  onClose: () => void;
}

export function AgentMessageActionsDrawer({
  actions,
  isOpened,
  onClose,
}: AgentMessageActionsDrawerProps) {
  return (
    <Modal
      isOpen={isOpened}
      onClose={onClose}
      title="Actions Details"
      variant="side-md"
      hasChanged={false}
    >
      <Page variant="modal">
        <Page.Layout direction="vertical">
          <div className="h-full w-full overflow-visible">
            {actions.map((action, idx) => {
              const actionSpecification = getActionSpecification(action.type);

              const ActionDetailsComponent =
                actionSpecification.detailsComponent;
              return (
                <div key={`action-${action.id}`}>
                  {idx !== 0 && <Page.Separator />}
                  <ActionDetailsComponent
                    action={action}
                    defaultOpen={idx === 0}
                  />
                </div>
              );
            })}
          </div>
        </Page.Layout>
      </Page>
    </Modal>
  );
}
