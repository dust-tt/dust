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
  const groupedActionsByStep = actions.reduce((acc, current) => {
    // Step starts at 0.
    const currentStep = current.step + 1;

    acc[currentStep] = acc[currentStep] || [];
    acc[currentStep].push(current);
    return acc;
  }, {} as Record<number, AgentActionType[]>);

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
          <div className="h-full w-full overflow-y-auto">
            {Object.entries(groupedActionsByStep).map(([step, actions]) => {
              return (
                <div className="flex flex-col gap-4 pb-4" key={step}>
                  <p className="text-xl font-bold text-slate-900">
                    Step {step}
                  </p>
                  {actions.map((action, idx) => {
                    const actionSpecification = getActionSpecification(
                      action.type
                    );

                    const ActionDetailsComponent =
                      actionSpecification.detailsComponent;
                    return (
                      <div key={`action-${action.id}`}>
                        {idx !== 0 && <Page.Separator />}
                        <ActionDetailsComponent
                          action={action}
                          defaultOpen={idx === 0 && step === "1"}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </Page.Layout>
      </Page>
    </Modal>
  );
}
