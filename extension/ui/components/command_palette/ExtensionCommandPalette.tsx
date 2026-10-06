import { CommandPalette } from "@app/components/command_palette/CommandPalette";
import { useAppKeyboardShortcuts } from "@app/hooks/useAppKeyboardShortcuts";
import type { UserType, WorkspaceType } from "@app/types/user";

interface ExtensionCommandPaletteProps {
  owner: WorkspaceType;
  user: UserType;
}

/**
 * Mounts a simplified command palette: the extension has no admin settings,
 * details sheets or builder pages.
 */
export function ExtensionCommandPalette({
  owner,
  user,
}: ExtensionCommandPaletteProps) {
  useAppKeyboardShortcuts(owner);

  return (
    <CommandPalette
      key={owner.sId}
      owner={owner}
      user={user}
      hideSettings
      hideAgentActions
      hideSkillActions
      hideMemberActions
    />
  );
}
