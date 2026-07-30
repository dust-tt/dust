import type { SkillAvailability } from "@app/types/assistant/skill_configuration";
import { pluralize } from "@app/types/shared/utils/string_utils";
import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  XClose,
} from "@dust-tt/sparkle";

export type BatchAvailabilityAction = {
  label: string;
  description?: string;
  availability: SkillAvailability;
  getDialogTitle: (count: number) => string;
  dialogDescription: (count: number) => string;
};

const BATCH_AVAILABILITY_ACTIONS: BatchAvailabilityAction[] = [
  {
    label: "Editors only",
    availability: "editors",
    getDialogTitle: (count) =>
      `Make ${count} skill${pluralize(count)} editors only`,
    dialogDescription: (count) => {
      const pronoun = count === 1 ? "it" : "them";
      return `Non-editors can’t find or use ${pronoun} on their own, but they can still access ${pronoun} through any agent or skill that includes ${pronoun}.`;
    },
  },
  {
    label: "Workspace members",
    availability: "workspace_users",
    getDialogTitle: (count) =>
      `Make ${count} skill${pluralize(count)} available to workspace members`,
    dialogDescription: (count) => {
      const pronoun = count === 1 ? "it" : "them";
      return `Every workspace member can add ${pronoun} to agents or other skills and use ${pronoun} directly.`;
    },
  },
  {
    label: "Auto-discoverable",
    description:
      "Available to workspace members and agents with Discover Skills",
    availability: "users_and_agents",
    getDialogTitle: () => `This affects your entire workspace`,
    dialogDescription: (count) =>
      `Any agent with Discover Skills, including Dust, can use ${count === 1 ? "this skill" : "these skills"} automatically.`,
  },
];

interface SkillsBatchEditBarProps {
  selectedCount: number;
  isUpdating: boolean;
  canMakeSkillAutoDiscoverable: boolean;
  onClose: () => void;
  onSelectAction: (action: BatchAvailabilityAction) => void;
}

export function SkillsBatchEditBar({
  selectedCount,
  isUpdating,
  canMakeSkillAutoDiscoverable,
  onClose,
  onSelectAction,
}: SkillsBatchEditBarProps) {
  return (
    <div className="flex flex-row items-center justify-between gap-2 rounded-xl bg-muted-background px-2 py-2 dark:bg-muted-background-night">
      <Button
        variant="outline"
        size="sm"
        icon={XClose}
        label="Close edition"
        onClick={onClose}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            label="Set availability"
            isSelect
            isLoading={isUpdating}
            disabled={selectedCount === 0 || isUpdating}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {BATCH_AVAILABILITY_ACTIONS.map((action) => {
            const isActionDisabled =
              action.availability === "users_and_agents" &&
              !canMakeSkillAutoDiscoverable;
            return (
              <DropdownMenuItem
                key={action.availability}
                label={action.label}
                description={
                  isActionDisabled
                    ? "You don’t have permission to make skills auto-discoverable"
                    : action.description
                }
                disabled={isActionDisabled}
                onClick={() => onSelectAction(action)}
              />
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface BatchAvailabilityDialogProps {
  action: BatchAvailabilityAction;
  selectedCount: number;
  isUpdating: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function BatchAvailabilityDialog({
  action,
  selectedCount,
  isUpdating,
  onConfirm,
  onCancel,
}: BatchAvailabilityDialogProps) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isUpdating) {
          onCancel();
        }
      }}
    >
      <DialogContent size="md" isAlertDialog>
        <DialogHeader hideButton>
          <DialogTitle>{action.getDialogTitle(selectedCount)}</DialogTitle>
        </DialogHeader>
        <DialogContainer className="text-sm">
          {action.dialogDescription(selectedCount)}
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            disabled: isUpdating,
          }}
          rightButtonProps={{
            label: "Update",
            disabled: isUpdating,
            isLoading: isUpdating,
            onClick: async (e: React.MouseEvent) => {
              e.preventDefault();
              await onConfirm();
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
