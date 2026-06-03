import type { PaletteActionConfig } from "@app/components/command_palette/CommandPaletteContext";
import type { AppRouter } from "@app/lib/platform";
import { getConversationRoute } from "@app/lib/utils/router";
import type { LightWorkspaceType } from "@app/types/user";
import { ChatBubbleBottomCenterTextIcon } from "@dust-tt/sparkle";

interface DefaultPaletteActionsParams {
  owner: LightWorkspaceType;
  router: AppRouter;
}

export function getDefaultPaletteActions({
  owner,
  router,
}: DefaultPaletteActionsParams): PaletteActionConfig[] {
  return [
    {
      id: "new-conversation",
      label: "New conversation",
      description: "Start a new conversation",
      icon: ChatBubbleBottomCenterTextIcon,
      onSelect: () => {
        void router.push(getConversationRoute(owner.sId, "new"));
      },
    },
  ];
}
