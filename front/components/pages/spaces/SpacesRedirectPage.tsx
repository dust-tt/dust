import { usePersistedNavigationSelection } from "@app/hooks/usePersistedNavigationSelection";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { useSpaceInfo, useSpaces, useSystemSpace } from "@app/lib/swr/spaces";
import { Spinner } from "@dust-tt/sparkle";
import { useEffect } from "react";

// This page redirects to the appropriate space based on user preferences and role.
export function SpacesRedirectPage() {
  const router = useAppRouter();
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

  const { spaces: globalSpaces, isSpacesLoading: isGlobalSpaceLoading } =
    useSpaces({
      workspaceId: owner.sId,
      kinds: ["global"],
      disabled: isAdmin,
    });
  const globalSpace = globalSpaces[0] ?? null;

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
