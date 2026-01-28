import { Spinner } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useEffect } from "react";

import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import { usePersistedNavigationSelection } from "@app/hooks/usePersistedNavigationSelection";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSideProps } from "@app/lib/auth/appServerSideProps";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import {
  useGlobalSpace,
  useSpaceInfo,
  useSystemSpace,
} from "@app/lib/swr/spaces";

export const getServerSideProps = appGetServerSideProps;

// This page redirects to the appropriate space based on user preferences and role.
function DefaultSpace() {
  const router = useRouter();
  const owner = useWorkspace();
  const { isAdmin } = useAuth();

  const { navigationSelection, isLoading: isNavSelectionLoading } =
    usePersistedNavigationSelection();

  const lastSpaceId = navigationSelection.lastSpaceId;
  const lastSpaceCategory = navigationSelection.lastSpaceCategory;

  // Fetch the last selected space if available
  const { spaceInfo: lastSpace, isSpaceInfoLoading: isLastSpaceLoading } =
    useSpaceInfo({
      workspaceId: owner.sId,
      spaceId: lastSpaceId ?? null,
      disabled: !lastSpaceId,
    });

  // Fetch fallback spaces
  const { systemSpace, isSystemSpaceLoading } = useSystemSpace({
    workspaceId: owner.sId,
    disabled: !isAdmin,
  });

  const { globalSpace, isGlobalSpaceLoading } = useGlobalSpace({
    workspaceId: owner.sId,
    disabled: isAdmin,
  });

  useEffect(() => {
    // Wait for navigation selection to load
    if (isNavSelectionLoading) {
      return;
    }

    // If we have a last selected space, wait for it to load and redirect if accessible
    if (lastSpaceId) {
      if (isLastSpaceLoading) {
        return;
      }
      if (lastSpace) {
        const redirectPath =
          `/w/${owner.sId}/spaces/${lastSpace.sId}` +
          (lastSpaceCategory ? `/categories/${lastSpaceCategory}` : "");
        void router.replace(redirectPath);
        return;
      }
    }

    // Fall back to system space for admins
    if (isAdmin) {
      if (isSystemSpaceLoading) {
        return;
      }
      if (systemSpace) {
        void router.replace(`/w/${owner.sId}/spaces/${systemSpace.sId}`);
        return;
      }
    } else {
      // Fall back to global space for non-admins
      if (isGlobalSpaceLoading) {
        return;
      }
      if (globalSpace) {
        void router.replace(`/w/${owner.sId}/spaces/${globalSpace.sId}`);
        return;
      }
    }
  }, [
    isNavSelectionLoading,
    lastSpaceId,
    lastSpaceCategory,
    isLastSpaceLoading,
    lastSpace,
    isAdmin,
    isSystemSpaceLoading,
    systemSpace,
    isGlobalSpaceLoading,
    globalSpace,
    owner.sId,
    router,
  ]);

  return (
    <div className="flex h-screen items-center justify-center">
      <Spinner />
    </div>
  );
}

const PageWithAuthLayout = DefaultSpace as AppPageWithLayout;

PageWithAuthLayout.getLayout = (
  page: ReactElement,
  pageProps: AuthContextValue
) => {
  return (
    <AppAuthContextLayout authContext={pageProps}>{page}</AppAuthContextLayout>
  );
};

export default PageWithAuthLayout;
