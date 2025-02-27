import {
  Breadcrumbs,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Page,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewCategory,
  DataSourceViewType,
  PlanType,
  SpaceType,
  SubscriptionType,
  WorkspaceType,
} from "@dust-tt/types";
import { useRouter } from "next/router";
import type { ComponentType } from "react";
import React, { useCallback, useMemo, useState } from "react";

import RootLayout from "@app/components/app/RootLayout";
import { CreateOrEditSpaceModal } from "@app/components/spaces/CreateOrEditSpaceModal";
import { CATEGORY_DETAILS } from "@app/components/spaces/SpaceCategoriesList";
import { SpaceSearchInput } from "@app/components/spaces/SpaceSearchLayout";
import SpaceSideBarMenu from "@app/components/spaces/SpaceSideBarMenu";
import AppLayout from "@app/components/sparkle/AppLayout";
import { getDataSourceNameFromView } from "@app/lib/data_sources";
import { isEntreprisePlan } from "@app/lib/plans/plan_codes";
import {
  getSpaceIcon,
  getSpaceName,
  isPrivateSpacesLimitReached,
} from "@app/lib/spaces";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";

export interface SpaceLayoutPageProps {
  canReadInSpace: boolean;
  canWriteInSpace: boolean;
  category?: DataSourceViewCategory;
  dataSourceView?: DataSourceViewType;
  isAdmin: boolean;
  owner: WorkspaceType;
  parentId?: string;
  plan: PlanType;
  space: SpaceType;
  subscription: SubscriptionType;
}

interface SpaceLayoutProps {
  children: React.ReactNode;
  hideHeader?: boolean;
  pageDescription?: React.ReactNode;
  pageProps: SpaceLayoutPageProps;
  pageTitle?: string;
  useBackendSearch?: boolean;
}

export function SpaceLayout({
  children,
  hideHeader,
  pageDescription,
  pageProps,
  pageTitle,
  useBackendSearch = false,
}: SpaceLayoutProps) {
  const [spaceCreationModalState, setSpaceCreationModalState] = useState({
    isOpen: false,
    defaultRestricted: false,
  });

  const {
    category,
    canReadInSpace,
    canWriteInSpace,
    dataSourceView,
    isAdmin,
    owner,
    parentId,
    plan,
    space,
    subscription,
  } = pageProps;
  const router = useRouter();

  const { spaces } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: plan.limits.vaults.maxVaults === 0 || !isAdmin,
  });

  const isLimitReached = isPrivateSpacesLimitReached(spaces, plan);
  const isEnterprise = isEntreprisePlan(plan.code);

  const closeSpaceCreationModal = useCallback(() => {
    setSpaceCreationModalState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const openSpaceCreationModal = useCallback(
    ({ defaultRestricted }: { defaultRestricted: boolean }) => {
      setSpaceCreationModalState({ defaultRestricted, isOpen: true });
    },
    []
  );

  return (
    <RootLayout>
      <AppLayout
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
        <Page.Vertical gap="xl" align="stretch">
          {!hideHeader && (
            <Page.Header
              title={pageTitle ?? getSpaceName(space)}
              icon={getSpaceIcon(space)}
              description={pageDescription}
            />
          )}

          <SpaceSearchInput
            category={category}
            canReadInSpace={canReadInSpace}
            canWriteInSpace={canWriteInSpace}
            owner={owner}
            useBackendSearch={useBackendSearch}
            space={space}
            dataSourceView={dataSourceView}
            parentId={parentId}
          >
            {children}
          </SpaceSearchInput>
        </Page.Vertical>

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
      </AppLayout>
    </RootLayout>
  );
}
