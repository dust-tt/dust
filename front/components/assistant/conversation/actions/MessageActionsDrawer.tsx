import { Modal, Page } from "@dust-tt/sparkle";
import type { AgentActionType } from "@dust-tt/types";

import { getActionSpecification } from "@app/components/actions/types";

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
