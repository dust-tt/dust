import type { ReactElement } from "react";

import { ConversationLayout } from "@app/components/assistant/conversation/ConversationLayout";
import { AdminLayout } from "@app/components/layouts/AdminLayout";
import { SpaceLayout } from "@app/components/spaces/SpaceLayout";
import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import { AppContentLayout } from "@app/components/sparkle/AppContentLayout";
import { AppLayoutProvider } from "@app/components/sparkle/AppLayoutContext";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";

export function appGetLayout(page: ReactElement, pageProps: AuthContextValue) {
  return (
    <AppAuthContextLayout authContext={pageProps}>
      <AppLayoutProvider>
        <AppContentLayout>{page}</AppContentLayout>
      </AppLayoutProvider>
    </AppAuthContextLayout>
  );
}

export function conversationGetLayout(
  page: ReactElement,
  pageProps: AuthContextValue
) {
  return appGetLayout(
    <ConversationLayout pageProps={pageProps}>{page}</ConversationLayout>,
    pageProps
  );
}

export function spaceGetLayout(
  page: ReactElement,
  pageProps: AuthContextValue
) {
  return appGetLayout(<SpaceLayout>{page}</SpaceLayout>, pageProps);
}

export function adminGetLayout(
  page: ReactElement,
  pageProps: AuthContextValue
) {
  return appGetLayout(<AdminLayout>{page}</AdminLayout>, pageProps);
}
