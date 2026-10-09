import { BulkSelectionBar } from "@app/components/shared/BulkSelectionBar";
import type { ArchivableSkill } from "@app/components/skills/ArchiveSkillsDialog";
import { ArchiveSkillsDialog } from "@app/components/skills/ArchiveSkillsDialog";
import { getSkillIcon, SKILL_AVATAR_BACKGROUND_COLOR } from "@app/lib/skill";
import type {
  SkillAvailability,
  SkillListItemType,
} from "@app/types/assistant/skill_configuration";
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
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";

export type BatchAvailabilityAction = {
  label: MessageDescriptor;
  description?: MessageDescriptor;
  availability: SkillAvailability;
  getDialogTitle: (count: number) => MessageDescriptor;
  dialogDescription: (count: number) => MessageDescriptor;
};

const BATCH_AVAILABILITY_ACTIONS: BatchAvailabilityAction[] = [
  {
    label: msg`Editors only`,
    availability: "editors",
    getDialogTitle: (count) =>
      msg`${plural(count, {
        one: "Make # skill editors only",
        other: "Make # skills editors only",
      })}`,
    dialogDescription: (count) =>
      msg`${plural(count, {
        one: "Only editors can find it via the composer and agent builder. The skill remains available through agents and skills that use it.",
        other:
          "Only editors can find them via the composer and agent builder. The skills remain available through agents and skills that use them.",
      })}`,
  },
  {
    label: msg`Members`,
    availability: "workspace_users",
    getDialogTitle: (count) =>
      msg`${plural(count, {
        one: "Make # skill available to all members",
        other: "Make # skills available to all members",
      })}`,
    dialogDescription: (count) =>
      msg`${plural(count, {
        one: "All members can find it via the composer and agent builder.",
        other: "All members can find them via the composer and agent builder.",
      })}`,
  },
  {
    label: msg`Members and agents`,
    description: msg`Available to all members and agents with Discover Skills`,
    availability: "users_and_agents",
    getDialogTitle: () => msg`This affects your entire workspace`,
    dialogDescription: (count) =>
      msg`${plural(count, {
        one: "All members can find it via the composer and agent builder. Agents with Discover Skills, including Dust, can use it automatically.",
        other:
          "All members can find them via the composer and agent builder. Agents with Discover Skills, including Dust, can use them automatically.",
      })}`,
  },
];

export type BatchEditableSkill = ArchivableSkill &
  Pick<SkillListItemType, "canAdministrate" | "name" | "icon">;

interface SkillsBatchEditBarProps {
  selectedSkills: BatchEditableSkill[];
  totalCount: number;
  isUpdating: boolean;
  canSetAvailability?: boolean;
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
  canSetAvailability = true,
  canMakeSkillAutoDiscoverable,
  owner,
  onClear,
  onSelectAll,
  onSelectAction,
}: SkillsBatchEditBarProps) {
  const { t } = useLingui();
  const selectedCount = selectedSkills.length;
  const canArchiveSelection = selectedSkills.every(
    (skill) => skill.canAdministrate
  );

  return (
    <BulkSelectionBar
      selectedCount={selectedCount}
      selectedLabel={t({
        message: plural(selectedCount, {
          one: "# selected",
          other: "# selected",
        }),
        context: "selected skills",
      })}
      selectAllLabel={t`Select all ${plural(totalCount, { one: "# skill", other: "# skills" })}`}
      canSelectAll={totalCount > selectedCount}
      onSelectAll={onSelectAll}
      onClear={onClear}
      disabled={isUpdating}
      isLoading={isUpdating}
      selectedAvatars={selectedSkills.map((skill) => ({
        name: skill.name,
        icon: getSkillIcon(skill.icon),
        backgroundColor: SKILL_AVATAR_BACKGROUND_COLOR,
      }))}
    >
      {canSetAvailability && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="primary"
              size="sm"
              label={t`Set availability`}
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
                  label={t(action.label)}
                  description={
                    isActionDisabled
                      ? t`You don’t have permission to make skills auto-discoverable`
                      : action.description && t(action.description)
                  }
                  disabled={isActionDisabled}
                  onClick={() => onSelectAction(action)}
                />
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
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
  const { t } = useLingui();

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
          <DialogTitle>{t(action.getDialogTitle(selectedCount))}</DialogTitle>
        </DialogHeader>
        <DialogContainer className="text-sm">
          {t(action.dialogDescription(selectedCount))}
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: t`Cancel`,
            variant: "outline",
            disabled: isUpdating,
          }}
          rightButtonProps={{
            label: t`Update`,
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
