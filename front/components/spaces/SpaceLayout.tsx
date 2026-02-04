import {
  Chip,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InformationCircleIcon,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import React, { useCallback, useState } from "react";

import { CreateOrEditSpaceModal } from "@app/components/spaces/CreateOrEditSpaceModal";
import { SpaceSearchInput } from "@app/components/spaces/SpaceSearchLayout";
import SpaceSideBarMenu from "@app/components/spaces/SpaceSideBarMenu";
import { AppWideModeLayout } from "@app/components/sparkle/AppWideModeLayout";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { isEntreprisePlanPrefix } from "@app/lib/plans/plan_codes";
import { useAppRouter, usePathParams, useSearchParam } from "@app/lib/platform";
import { isPrivateSpacesLimitReached } from "@app/lib/spaces";
import {
  useSpaceDataSourceView,
  useSpaceInfo,
  useSpacesAsAdmin,
} from "@app/lib/swr/spaces";
import { isValidDataSourceViewCategory } from "@app/types";

interface SpaceLayoutProps {
  children: React.ReactNode;
}

export function SpaceLayout({ children }: SpaceLayoutProps) {
  const params = usePathParams();
  const spaceId = params.spaceId;
  const category = params.category;
  const dataSourceViewId = params.dataSourceViewId;
  const parentId = useSearchParam("parentId");

  const owner = useWorkspace();
  const { subscription, isAdmin } = useAuth();
  const plan = subscription.plan;

  const router = useAppRouter();

  const [spaceCreationModalState, setSpaceCreationModalState] = useState({
    isOpen: false,
    defaultRestricted: false,
  });

  const {
    spaceInfo: space,
    canWriteInSpace,
    canReadInSpace,
    isSpaceInfoLoading,
  } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: spaceId ?? null,
  });

  const { dataSourceView, isDataSourceViewLoading } = useSpaceDataSourceView({
    owner,
    spaceId: spaceId ?? null,
    dataSourceViewId: dataSourceViewId ?? null,
    disabled: !dataSourceViewId,
  });

  const { spaces } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: plan.limits.vaults.maxVaults === 0 || !isAdmin,
  });

  const isLimitReached = isPrivateSpacesLimitReached(spaces, plan);
  const isEnterprise = isEntreprisePlanPrefix(plan.code);

  const closeSpaceCreationModal = useCallback(() => {
    setSpaceCreationModalState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const openSpaceCreationModal = useCallback(
    ({ defaultRestricted }: { defaultRestricted: boolean }) => {
      setSpaceCreationModalState({ defaultRestricted, isOpen: true });
    },
    []
  );

  const isLoading =
    isSpaceInfoLoading || (dataSourceViewId && isDataSourceViewLoading);

  const validCategory = isValidDataSourceViewCategory(category)
    ? category
    : undefined;

  return (
    <AppWideModeLayout
      subscription={subscription}
      owner={owner}
      navChildren={
        <SpaceSideBarMenu
          owner={owner}
          isAdmin={isAdmin}
          openSpaceCreationModal={openSpaceCreationModal}
        />
      }
    >
      {isLoading || !space ? (
        <div className="flex h-screen items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="flex w-full flex-col">
          <Page.Vertical gap="lg" align="stretch">
            {
              // Message to admins that are not members of the space.
              // No need to show it for system space since it's a no-member space.
              !canReadInSpace && space.kind !== "system" && (
                <div>
                  <Chip
                    color="rose"
                    label="You are not a member of this space."
                    size="sm"
                    icon={InformationCircleIcon}
                  />
                </div>
              )
            }
            <SpaceSearchInput
              category={validCategory}
              canReadInSpace={canReadInSpace}
              canWriteInSpace={canWriteInSpace}
              owner={owner}
              useBackendSearch
              space={space}
              dataSourceView={dataSourceView ?? undefined}
              parentId={parentId ?? undefined}
            >
              {isLoading || !space ? (
                <div className="flex h-screen items-center justify-center">
                  <Spinner />
                </div>
              ) : (
                children
              )}
            </SpaceSearchInput>
          </Page.Vertical>
        </div>
      )}

      {isAdmin && !isLimitReached && (
        <CreateOrEditSpaceModal
          isAdmin={isAdmin}
          owner={owner}
          isOpen={!isLimitReached && spaceCreationModalState.isOpen}
          onClose={closeSpaceCreationModal}
          onCreated={(space) => {
            void router.push(`/w/${owner.sId}/spaces/${space.sId}`);
          }}
          defaultRestricted={spaceCreationModalState.defaultRestricted}
          plan={plan}
        />
      )}
      {isAdmin && isLimitReached && (
        <Dialog
          open={isLimitReached && spaceCreationModalState.isOpen}
          onOpenChange={(open) => {
            if (!open) {
              closeSpaceCreationModal();
            }
          }}
        >
          <DialogContent size="md" isAlertDialog>
            <DialogHeader hideButton>
              <DialogTitle>You can't create more spaces.</DialogTitle>
            </DialogHeader>
            <DialogContainer>
              {isEnterprise
                ? "We're going to make changes to data permissions spaces soon and are limiting the creation of spaces for that reason. Reach out to us to learn more."
                : "The maximum number of spaces for this workspace has been reached. Please reach out at support@dust.tt to learn more."}
            </DialogContainer>
            <DialogFooter
              rightButtonProps={{
                label: "Ok",
                variant: "outline",
                onClick: closeSpaceCreationModal,
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </AppWideModeLayout>
  );
}
