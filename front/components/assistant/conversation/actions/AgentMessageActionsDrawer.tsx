import { Modal, Page, Spinner } from "@dust-tt/sparkle";
import type { AgentActionType, LightWorkspaceType } from "@dust-tt/types";

import { getActionSpecification } from "@app/components/actions/types";

interface AgentMessageActionsDrawerProps {
  actions: AgentActionType[];
  isOpened: boolean;
  isStreaming: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
}

export function AgentMessageActionsDrawer({
  actions,
  isOpened,
  isStreaming,
  onClose,
  owner,
}: AgentMessageActionsDrawerProps) {
  const groupedActionsByStep = actions.reduce(
    (acc, current) => {
      // Step starts at 0.
      const currentStep = current.step + 1;

      acc[currentStep] = acc[currentStep] || [];
      acc[currentStep].push(current);
      return acc;
    },
    {} as Record<number, AgentActionType[]>
  );

  return (
    <Modal
      isOpen={isOpened}
      onClose={onClose}
      title="Breakdown of the tools used"
      variant="side-md"
      hasChanged={false}
    >
      <Page variant="modal">
        <Page.Layout direction="vertical">
          <div className="h-full w-full overflow-y-auto">
            {Object.entries(groupedActionsByStep).map(([step, actions]) => {
              return (
                <div
                  className="flex flex-col gap-4 pb-4 duration-1000 animate-in fade-in"
                  key={step}
                >
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
                          owner={owner}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {isStreaming && (
              <div className="flex justify-center">
                <Spinner variant="color" />
              </div>
            )}
          </div>
        </Page.Layout>
      </Page>
    </Modal>
  );
}
