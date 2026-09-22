import config from "@app/lib/api/config";
import { useAppRouter } from "@app/lib/platform";
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
  Trash01,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface SkillActionsMenuProps {
  owner: LightWorkspaceType;
  skillId: string;
  canEdit: boolean;
  onSelect: () => void;
  onArchive?: () => void;
  onOpenChange?: (open: boolean) => void;
  statusItems?: MenuItem[];
}

export function SkillActionsMenu({
  owner,
  skillId,
  canEdit,
  onSelect,
  onArchive,
  onOpenChange,
  statusItems = [],
}: SkillActionsMenuProps) {
  const router = useAppRouter();
  // Control the menu locally so clicking "Copy link" does not close it.
  const [isOpen, setIsOpen] = useState(false);
  const [isCopied, copyLink] = useCopyToClipboard();
  const menuItems: MenuItem[] = [...statusItems];
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    onOpenChange?.(open);
  };

  if (canEdit) {
    menuItems.push({
      kind: "item",
      label: "Edit",
      icon: Edit04,
      onClick: (event) => {
        event.stopPropagation();
        handleOpenChange(false);
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
        handleOpenChange(false);
        onSelect();
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

  if (onArchive) {
    menuItems.push({
      kind: "item",
      label: "Archive",
      icon: Trash01,
      variant: "warning",
      onClick: (event) => {
        event.stopPropagation();
        handleOpenChange(false);
        onArchive();
      },
    });
  }

  return (
    <DataTable.MoreButton
      menuItems={menuItems}
      dropdownMenuProps={{
        open: isOpen,
        onOpenChange: handleOpenChange,
      }}
    />
  );
}
