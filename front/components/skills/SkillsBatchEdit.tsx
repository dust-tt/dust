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
    label: "Editor only",
    availability: "editors",
    getDialogTitle: (count) =>
      `Make ${count} skill${pluralize(count)} editor only`,
    dialogDescription: (count) =>
      count === 1
        ? "Non-editors won’t see this skill as an option in the builder. Agents and skills that already use it won’t lose access."
        : "Non-editors won’t see these skills as options in the builder. Agents and skills that already use them won’t lose access.",
  },
  {
    label: "Workspace members",
    availability: "workspace_users",
    getDialogTitle: (count) =>
      `Make ${count} skill${pluralize(count)} available to workspace members`,
    dialogDescription: (count) =>
      count === 1
        ? "Every workspace member can add it to agents, other skills and use it directly."
        : "Every workspace member can add them to agents, other skills and use them directly.",
  },
  {
    label: "Auto-discoverable",
    description:
      "Available to workspace members and agents with Discover Skills",
    availability: "users_and_agents",
    getDialogTitle: () => `This affects your entire workspace`,
    dialogDescription: (count) =>
      `Any agent with the Discover Skills tool, including Dust, can use ${count === 1 ? "this skill" : "these skills"} automatically.`,
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
          {BATCH_AVAILABILITY_ACTIONS.filter(
            (action) =>
              canMakeSkillAutoDiscoverable ||
              action.availability !== "users_and_agents"
          ).map((action) => (
            <DropdownMenuItem
              key={action.availability}
              label={action.label}
              description={action.description}
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
