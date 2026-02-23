import { ConversationLayout } from "@dust-tt/front/components/assistant/conversation/ConversationLayout";
import { useAuth, useWorkspace } from "@dust-tt/front/lib/auth/AuthContext";
import { Outlet } from "react-router-dom";

/**
 * Router layout that provides ConversationLayout for SPA conversation routes.
 * Gets auth context from AppAuthContextLayout and passes it to ConversationLayout.
 */
export function ConversationRouterLayout() {
  const owner = useWorkspace();
  const { subscription, user, isAdmin, isBuilder } = useAuth();

  const pageProps = {
    workspace: owner,
    subscription,
    user,
    isAdmin,
    isBuilder,
  };

  return (
    <ConversationLayout pageProps={pageProps}>
      <Outlet />
    </ConversationLayout>
  );
}
