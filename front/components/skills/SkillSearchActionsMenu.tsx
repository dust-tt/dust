import { ArchiveSkillDialog } from "@app/components/skills/ArchiveSkillDialog";
import config from "@app/lib/api/config";
import { useAppRouter } from "@app/lib/platform";
import { useSkill } from "@app/lib/swr/skill_configurations";
import {
  getManageSkillsRoute,
  getSkillBuilderRoute,
} from "@app/lib/utils/router";
import type { LightWorkspaceType } from "@app/types/user";
import type { MenuItem } from "@dust-tt/sparkle";
import {
  Clipboard,
  ClipboardCheck,
  DataTable,
  Edit04,
  Eye,
  Spinner,
  Trash01,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { useState } from "react";

export function SkillSearchActionsMenu({
  owner,
  skillId,
  onSelect,
  onRefresh,
}: {
  owner: LightWorkspaceType;
  skillId: string;
  onSelect: (skillId: string) => void;
  onRefresh: () => void;
}) {
  const router = useAppRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [isCopied, copyLink] = useCopyToClipboard();
  const { skill, isSkillLoading, isSkillError, mutateSkill } = useSkill({
    workspaceId: owner.sId,
    skillId,
    withRelations: true,
    disabled: !isOpen && !isArchiveDialogOpen,
    shouldRetryOnError: false,
  });

  const menuItems: MenuItem[] = [];
  if (isSkillLoading) {
    menuItems.push({
      kind: "item",
      label: "Loading actions...",
      icon: () => <Spinner size="xs" />,
      disabled: true,
    });
  } else if (isSkillError) {
    menuItems.push({
      kind: "item",
      label: "Could not load actions. Retry",
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        void mutateSkill();
      },
    });
  } else if (skill?.canAdministrate && skill.canRead) {
    menuItems.push({
      kind: "item",
      label: "Edit",
      icon: Edit04,
      onClick: (event) => {
        event.stopPropagation();
        setIsOpen(false);
        void router.push(getSkillBuilderRoute(owner.sId, skillId));
      },
    });
  }

  menuItems.push(
    {
      kind: "item",
      label: "More info",
      icon: Eye,
      onClick: (event) => {
        event.stopPropagation();
        setIsOpen(false);
        onSelect(skillId);
      },
    },
    {
      kind: "item",
      label: isCopied ? "Copied!" : "Copy link",
      icon: isCopied ? ClipboardCheck : Clipboard,
      onClick: async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await copyLink(
          `${config.getAppUrl()}${getManageSkillsRoute(owner.sId, skillId)}`
        );
      },
    }
  );

  if (!isSkillError && skill?.canAdministrate) {
    menuItems.push({
      kind: "item",
      label: "Archive",
      icon: Trash01,
      variant: "warning",
      onClick: (event) => {
        event.stopPropagation();
        setIsOpen(false);
        setIsArchiveDialogOpen(true);
      },
    });
  }

  return (
    <>
      <DataTable.MoreButton
        menuItems={menuItems}
        dropdownMenuProps={{ open: isOpen, onOpenChange: setIsOpen }}
      />
      {skill && (
        <ArchiveSkillDialog
          owner={owner}
          skill={skill}
          isOpen={isArchiveDialogOpen}
          onClose={() => {
            setIsArchiveDialogOpen(false);
            onRefresh();
          }}
        />
      )}
    </>
  );
}
