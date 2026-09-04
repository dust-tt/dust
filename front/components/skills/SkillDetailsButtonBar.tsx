import { ArchiveSkillDialog } from "@app/components/skills/ArchiveSkillDialog";
import { SkillFavoriteButton } from "@app/components/skills/SkillFavoriteButton";
import config from "@app/lib/api/config";
import {
  getConversationRoute,
  getManageSkillsRoute,
  getSkillBuilderRoute,
} from "@app/lib/utils/router";
import type { GetSkillsWithRelationsResponseBody } from "@app/types/api/skills";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  Clipboard,
  ClipboardCheck,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Edit04,
  MessagePlusCircle,
  Trash01,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface SkillDetailsButtonBarProps {
  skill: GetSkillsWithRelationsResponseBody["skills"][number];
  owner: WorkspaceType;
  onClose: () => void;
  replaceOnEdit?: boolean;
  onFavoriteChange?: (
    skill: GetSkillsWithRelationsResponseBody["skills"][number],
    isFavorite: boolean
  ) => Promise<void>;
}

export function SkillDetailsButtonBar({
  skill,
  owner,
  onClose,
  replaceOnEdit,
  onFavoriteChange,
}: SkillDetailsButtonBarProps) {
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [isSkillLinkCopied, copySkillLink] = useCopyToClipboard();

  // The API redacts the private fields of the skills an admin cannot read (built on spaces they
  // are not a member of) and flags it with `canRead: false`; only admins ever get such a skill.
  // Trying or favoriting it would fail, so those entry points are hidden (the edit and archive
  // ones already are, since the redaction drops `canAdministrate`).
  const isRedactedForAdmin = !skill.canRead;

  return (
    <>
      <ArchiveSkillDialog
        owner={owner}
        isOpen={showArchiveDialog}
        skill={skill}
        onClose={() => {
          setShowArchiveDialog(false);
          onClose();
        }}
      />
      <div className="flex flex-row items-center gap-2 px-1.5">
        {onFavoriteChange && !isRedactedForAdmin && (
          <SkillFavoriteButton
            isFavorite={skill.isFavorite ?? false}
            variant="outline"
            onFavoriteChange={(isFavorite) =>
              onFavoriteChange(skill, isFavorite)
            }
          />
        )}
        {!isRedactedForAdmin && (
          <Button
            size="sm"
            tooltip="Try skill"
            href={getConversationRoute(owner.sId, "new", `skill=${skill.sId}`)}
            variant="outline"
            icon={MessagePlusCircle}
          />
        )}
        {skill.canAdministrate && (
          <Button
            size="sm"
            tooltip="Edit skill"
            href={getSkillBuilderRoute(owner.sId, skill.sId)}
            replace={replaceOnEdit}
            variant="outline"
            icon={Edit04}
          />
        )}
        <Button
          size="sm"
          tooltip={isSkillLinkCopied ? "Copied!" : "Copy link"}
          variant="outline"
          icon={isSkillLinkCopied ? ClipboardCheck : Clipboard}
          onClick={(e) => {
            e.stopPropagation();
            void copySkillLink(
              `${config.getAppUrl()}${getManageSkillsRoute(owner.sId, skill.sId)}`
            );
          }}
        />
        {skill.canAdministrate && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                icon={DotsHorizontal}
                size="sm"
                variant="ghost"
                tooltip="Skill options"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                label="Archive"
                icon={Trash01}
                variant="warning"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowArchiveDialog(true);
                }}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </>
  );
}
