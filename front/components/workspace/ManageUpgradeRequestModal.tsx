import type { MembershipUpgradeRequestType } from "@app/types/memberships";
import {
  ArrowUp,
  Avatar,
  ChevronRight,
  Coins02,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Icon,
  ListItem,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

interface ManageAction {
  key: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  description: string;
  onClick: () => void;
}

interface ManageUpgradeRequestModalProps {
  request: MembershipUpgradeRequestType | null;
  onClose: () => void;
  canUpgradePlan: boolean;
  onUpgradePlan: (request: MembershipUpgradeRequestType) => void;
  onSetCreditAmount: (request: MembershipUpgradeRequestType) => void;
}

export function ManageUpgradeRequestModal({
  request,
  onClose,
  canUpgradePlan,
  onUpgradePlan,
  onSetCreditAmount,
}: ManageUpgradeRequestModalProps) {
  const actions: ManageAction[] = [
    {
      key: "set-credit-amount",
      icon: Coins02,
      label: "Set credit amount",
      description: "Choose a specific spend limit for this member.",
      onClick: () => request && onSetCreditAmount(request),
    },
    ...(canUpgradePlan
      ? [
          {
            key: "upgrade-plan",
            icon: ArrowUp,
            label: "Upgrade User Plan",
            description: "Move the member to a seat with more credits.",
            onClick: () => request && onUpgradePlan(request),
          },
        ]
      : []),
  ];

  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Avatar
              visual={request?.requester.image ?? undefined}
              name={request?.requester.name}
              size="md"
              isRounded
            />
            <div>
              <DialogTitle>{request?.requester.name}</DialogTitle>
              <p className="text-sm text-muted-foreground">
                {request?.requester.email}
              </p>
            </div>
          </div>
        </DialogHeader>
        <DialogContainer>
          <div className="overflow-hidden rounded-2xl border border-border">
            {actions.map((action, index) => (
              <ListItem
                key={action.key}
                itemsAlignment="center"
                hasSeparator={index < actions.length - 1}
                onClick={() => {
                  action.onClick();
                  onClose();
                }}
              >
                <Avatar
                  icon={action.icon}
                  size="sm"
                  isRounded
                  backgroundColor="bg-highlight-50"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="heading-sm text-foreground">
                    {action.label}
                  </span>
                  <span className="copy-sm text-muted-foreground">
                    {action.description}
                  </span>
                </div>
                <Icon
                  visual={ChevronRight}
                  size="sm"
                  className="text-muted-foreground"
                />
              </ListItem>
            ))}
          </div>
        </DialogContainer>
      </DialogContent>
    </Dialog>
  );
}
