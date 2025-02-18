import {
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@dust-tt/sparkle";
import type { AgentActionType, LightWorkspaceType } from "@dust-tt/types";

import { getActionSpecification } from "@app/components/actions/types";

interface AgentMessageActionsDrawerProps {
  actions: AgentActionType[];
  isOpened: boolean;
  isActing: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
}
export function AgentMessageActionsDrawer({
  actions,
  isOpened,
  isActing,
  onClose,
  owner,
}: AgentMessageActionsDrawerProps) {
  const groupedActionsByStep = actions.reduce(
    (acc, current) => {
      const currentStep = current.step + 1;
      acc[currentStep] = acc[currentStep] || [];
      acc[currentStep].push(current);
      return acc;
    },
    {} as Record<number, AgentActionType[]>
  );

  return (
    <Sheet
      open={isOpened}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle>Breakdown of the tools used</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex flex-col gap-4">
            {Object.entries(groupedActionsByStep).map(([step, actions]) => (
              <div
                className="flex flex-col gap-4 pb-4 duration-1000 animate-in fade-in"
                key={step}
              >
                <p className="text-xl font-bold text-foreground dark:text-foreground-night">
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
            ))}
            {isActing && (
              <div className="flex justify-center">
                <Spinner variant="color" />
              </div>
            )}
          </div>
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
