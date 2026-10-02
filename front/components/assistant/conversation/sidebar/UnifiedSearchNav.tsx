import { useCommandPalette } from "@app/components/command_palette/CommandPaletteContext";
import { NavItemKeyboardShortcut } from "@app/components/navigation/NavItemKeyboardShortcut";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import { useIsMac } from "@app/hooks/useKeyboardShortcutLabel";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { getConversationRoute } from "@app/lib/utils/router";
import type { WorkspaceType } from "@app/types/user";
import {
  MessagePlusCircle,
  NavigationList,
  NavigationListItem,
  SearchMd,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import { useContext } from "react";

interface UnifiedSearchNavProps {
  owner: WorkspaceType;
  onNewConversationClick: () => void;
}

/**
 * Sidebar entries for unified search: new conversation + command-palette search.
 * Kept in its own file so SidebarMenu.tsx can stay free of Lingui (and the
 * translated-files-stay-translated contract) until that file is fully migrated.
 */
export function UnifiedSearchNav({
  owner,
  onNewConversationClick,
}: UnifiedSearchNavProps) {
  const { t } = useLingui();
  const { open: openCommandPalette } = useCommandPalette();
  const isMac = useIsMac();
  const { setSidebarOpen } = useContext(SidebarContext);

  return (
    <NavigationList className="mx-sidebar-side-spacing">
      <NavigationListItem
        label={t`New conversation`}
        icon={MessagePlusCircle}
        href={getConversationRoute(owner.sId)}
        suffix={<NavItemKeyboardShortcut keys={["C"]} />}
        onClick={withTracking(
          TRACKING_AREAS.NAVIGATION,
          "new_conversation",
          onNewConversationClick
        )}
      />
      <NavigationListItem
        label={t`Search`}
        icon={SearchMd}
        suffix={
          <NavItemKeyboardShortcut keys={[isMac ? "Cmd" : "Ctrl", "K"]} />
        }
        onClick={withTracking(
          TRACKING_AREAS.NAVIGATION,
          "open_command_palette",
          () => {
            setSidebarOpen(false);
            openCommandPalette();
          }
        )}
      />
    </NavigationList>
  );
}
