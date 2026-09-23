import { AppContentLayout } from "@dust-tt/front/components/sparkle/AppContentLayout";
import { AppLayoutProvider } from "@dust-tt/front/components/sparkle/AppLayoutContext";
import { ConversationFontProvider } from "@dust-tt/front/components/sparkle/ConversationFontContext";
import { Outlet } from "react-router-dom";

/**
 * Router layout that provides the shared AppContentLayout (navigation sidebar, title bar, etc.)
 * for SPA routes. Pages configure the layout via useAppLayoutConfig().
 *
 * Routes that don't need the layout chrome (onboarding, agent/skill builders)
 * should be placed outside this layout.
 */
export function AppContentRouterLayout() {
  return (
    <AppLayoutProvider>
      <ConversationFontProvider>
        <AppContentLayout>
          <Outlet />
        </AppContentLayout>
      </ConversationFontProvider>
    </AppLayoutProvider>
  );
}
