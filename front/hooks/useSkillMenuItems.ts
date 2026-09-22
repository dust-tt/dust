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
  Edit04,
  Eye,
  Trash01,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

export function useSkillMenuItems({ owner }: { owner: LightWorkspaceType }) {
  const { push } = useAppRouter();
  const [copiedSkillId, setCopiedSkillId] = useState<string | null>(null);
  const [isCopied, copyLink] = useCopyToClipboard();

  return useCallback(
    ({
      skillId,
      canEdit,
      onSelect,
      onArchive,
    }: {
      skillId: string;
      canEdit: boolean;
      onSelect: () => void;
      onArchive?: () => void;
    }): MenuItem[] => {
      const menuItems: MenuItem[] = [];

      if (canEdit) {
        menuItems.push({
          kind: "item",
          label: "Edit",
          icon: Edit04,
          onClick: (event) => {
            event.stopPropagation();
            void push(getSkillBuilderRoute(owner.sId, skillId));
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
            onSelect();
          },
        },
        {
          kind: "item",
          label:
            isCopied && copiedSkillId === skillId ? "Copied!" : "Copy link",
          icon:
            isCopied && copiedSkillId === skillId ? ClipboardCheck : Clipboard,
          onClick: async (event) => {
            event.preventDefault();
            event.stopPropagation();
            setCopiedSkillId(skillId);
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
            onArchive();
          },
        });
      }

      return menuItems;
    },
    [push, owner.sId, isCopied, copiedSkillId, copyLink]
  );
}
