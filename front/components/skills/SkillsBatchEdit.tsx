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
  availability: SkillAvailability;
  getDialogTitle: (count: number) => string;
  dialogDescription: string;
};

const BATCH_AVAILABILITY_ACTIONS: BatchAvailabilityAction[] = [
  {
    label: "Editor only",
    availability: "editors",
    getDialogTitle: (count) =>
      `Make ${count} skill${pluralize(count)} editor only`,
    dialogDescription:
      "Non-editors won’t see these skills as options in the builder. Agents and skills that already use them won’t lose access.",
  },
  {
    label: "Workspace members",
    availability: "workspace_users",
    getDialogTitle: (count) =>
      `Make ${count} skill${pluralize(count)} available to workspace members`,
    dialogDescription:
      "Every workspace member can add them to agents, other skills and use them directly.",
  },
  {
    label: "Auto-discoverable",
    availability: "users_and_agents",
    getDialogTitle: (count) =>
      `Make ${count} skill${pluralize(count)} auto-discoverable`,
    dialogDescription:
      "Auto-discoverable skills are available to workspace members and can be automatically activated by agents with Discover Skills tools enabled.",
  },
];

interface SkillsBatchEditBarProps {
  selectedCount: number;
  isUpdating: boolean;
  onClose: () => void;
  onSelectAction: (action: BatchAvailabilityAction) => void;
}

export function SkillsBatchEditBar({
  selectedCount,
  isUpdating,
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
        <DropdownMenuContent>
          {BATCH_AVAILABILITY_ACTIONS.map((action) => (
            <DropdownMenuItem
              key={action.availability}
              label={action.label}
              onClick={() => onSelectAction(action)}
            />
          ))}
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
          {action.dialogDescription}
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
