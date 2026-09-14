import { BulkSelectionBar } from "@app/components/shared/BulkSelectionBar";
import { ArchiveSkillsDialog } from "@app/components/skills/ArchiveSkillsDialog";
import type { GetSkillsWithRelationsResponseBody } from "@app/types/api/skills";
import type { SkillAvailability } from "@app/types/assistant/skill_configuration";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
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
      const subject = count === 1 ? "The skill remains" : "The skills remain";
      return `Only editors can find ${pronoun} via the composer and agent builder. ${subject} available through agents and skills that use ${pronoun}.`;
    },
  },
  {
    label: "Members",
    availability: "workspace_users",
    getDialogTitle: (count) =>
      `Make ${count} skill${pluralize(count)} available to all members`,
    dialogDescription: (count) => {
      const pronoun = count === 1 ? "it" : "them";
      return `All members can find ${pronoun} via the composer and agent builder.`;
    },
  },
  {
    label: "Members and agents",
    description: "Available to all members and agents with Discover Skills",
    availability: "users_and_agents",
    getDialogTitle: () => `This affects your entire workspace`,
    dialogDescription: (count) => {
      const pronoun = count === 1 ? "it" : "them";
      return `All members can find ${pronoun} via the composer and agent builder. Agents with Discover Skills, including Dust, can use ${pronoun} automatically.`;
    },
  },
];

interface SkillsBatchEditBarProps {
  selectedSkills: GetSkillsWithRelationsResponseBody["skills"];
  totalCount: number;
  isUpdating: boolean;
  canMakeSkillAutoDiscoverable: boolean;
  owner: LightWorkspaceType;
  onClear: () => void;
  onSelectAll: () => void;
  onSelectAction: (action: BatchAvailabilityAction) => void;
}

export function SkillsBatchEditBar({
  selectedSkills,
  totalCount,
  isUpdating,
  canMakeSkillAutoDiscoverable,
  owner,
  onClear,
  onSelectAll,
  onSelectAction,
}: SkillsBatchEditBarProps) {
  const selectedCount = selectedSkills.length;
  const canArchiveSelection = selectedSkills.every(
    (skill) => skill.canAdministrate
  );

  return (
    <BulkSelectionBar
      selectedCount={selectedCount}
      totalCount={totalCount}
      itemLabel="skill"
      canSelectAll={totalCount > selectedCount}
      onSelectAll={onSelectAll}
      onClear={onClear}
      disabled={isUpdating}
      isLoading={isUpdating}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="primary"
            size="sm"
            label="Set availability"
            isSelect
            disabled={isUpdating}
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
      <ArchiveSkillsDialog
        skills={selectedSkills}
        disabled={isUpdating || !canArchiveSelection}
        owner={owner}
        onSave={onClear}
      />
    </BulkSelectionBar>
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
