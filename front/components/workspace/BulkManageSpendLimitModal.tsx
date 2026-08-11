import {
  Avatar,
  ChevronRight,
  Coins02,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Icon,
  Infinity,
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

interface BulkManageSpendLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberCount: number;
  onAllowUnlimitedSpend: () => void;
  onSetCreditAmount: () => void;
}

export function BulkManageSpendLimitModal({
  isOpen,
  onClose,
  memberCount,
  onAllowUnlimitedSpend,
  onSetCreditAmount,
}: BulkManageSpendLimitModalProps) {
  const actions: ManageAction[] = [
    {
      key: "allow-unlimited-spend",
      icon: Infinity,
      label: "Use workspace default",
      description:
        "Remove these members' custom limit; they'll fall back to their group or workspace default cap.",
      onClick: onAllowUnlimitedSpend,
    },
    {
      key: "set-credit-amount",
      icon: Coins02,
      label: "Set credit amount",
      description: "Choose a specific spend limit for these members.",
      onClick: onSetCreditAmount,
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            Edit spend limit for {memberCount.toLocaleString("en-US")} members
          </DialogTitle>
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
