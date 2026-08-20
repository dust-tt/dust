import { ArchiveSkillsDialog } from "@app/components/skills/ArchiveSkillsDialog";
import { classNames } from "@app/lib/utils";
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
  Hoverable,
} from "@dust-tt/sparkle";

const BAR_CLASSNAME =
  "flex items-center gap-2 rounded-xl border bg-orange-50 border-orange-100 p-3 dark:bg-golden-950 dark:border-golden-900";
const BAR_TEXT_CLASSNAME = "text-xs text-orange-800 dark:text-golden-100";

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
      return `Only editors can find ${pronoun} via the input bar and agent builder. ${subject} available through agents and skills that use ${pronoun}.`;
    },
  },
  {
    label: "Members",
    availability: "workspace_users",
    getDialogTitle: (count) =>
      `Make ${count} skill${pluralize(count)} available to all members`,
    dialogDescription: (count) => {
      const pronoun = count === 1 ? "it" : "them";
      return `All members can find ${pronoun} via the input bar and agent builder.`;
    },
  },
  {
    label: "Members and agents",
    description: "Available to all members and agents with Discover Skills",
    availability: "users_and_agents",
    getDialogTitle: () => `This affects your entire workspace`,
    dialogDescription: (count) => {
      const pronoun = count === 1 ? "it" : "them";
      return `All members can find ${pronoun} via the input bar and agent builder. Agents with Discover Skills, including Dust, can use ${pronoun} automatically.`;
    },
  },
];

interface SkillsBatchEditBarProps {
  selectedSkills: GetSkillsWithRelationsResponseBody["skills"];
  pageSelectedCount: number;
  totalCount: number;
  isUpdating: boolean;
  canMakeSkillAutoDiscoverable: boolean;
  owner: LightWorkspaceType;
  onClear: () => void;
  onSelectAll: () => void;
  onSelectAction: (action: BatchAvailabilityAction) => void;
}

function skillLabel(count: number): string {
  return `skill${pluralize(count)}`;
}

export function SkillsBatchEditBar({
  selectedSkills,
  pageSelectedCount,
  totalCount,
  isUpdating,
  canMakeSkillAutoDiscoverable,
  owner,
  onClear,
  onSelectAll,
  onSelectAction,
}: SkillsBatchEditBarProps) {
  const selectedCount = selectedSkills.length;

  if (selectedCount === 0) {
    return null;
  }

  const isAllSelected = totalCount > 0 && selectedCount === totalCount;
  const canArchiveSelection = selectedSkills.every(
    (skill) => skill.canAdministrate
  );

  return (
    <div className={classNames("mt-3 mb-2", BAR_CLASSNAME)}>
      <div
        className={classNames(
          "flex flex-1 flex-row flex-wrap items-center gap-x-2 gap-y-1",
          BAR_TEXT_CLASSNAME
        )}
      >
        {isAllSelected ? (
          <span>
            {selectedCount} {skillLabel(selectedCount)} are selected.
          </span>
        ) : (
          <>
            <span>
              {pageSelectedCount} {skillLabel(pageSelectedCount)} selected on
              this page
            </span>
            <Hoverable variant="highlight" onClick={onSelectAll}>
              Select all {totalCount} {skillLabel(totalCount)}
            </Hoverable>
          </>
        )}
      </div>
      <Button
        size="xs"
        variant="ghost"
        label="Clear"
        onClick={onClear}
        disabled={isUpdating}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="primary"
            size="xs"
            label="Set availability"
            isSelect
            isLoading={isUpdating}
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
