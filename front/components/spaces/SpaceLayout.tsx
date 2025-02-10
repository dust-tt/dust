import {
  Breadcrumbs,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import SpaceSideBarMenu from "@app/components/spaces/SpaceSideBarMenu";
import AppLayout from "@app/components/sparkle/AppLayout";
import { getDataSourceNameFromView } from "@app/lib/data_sources";
import { isEntreprisePlan } from "@app/lib/plans/plan_codes";
import { getSpaceIcon, isPrivateSpacesLimitReached } from "@app/lib/spaces";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";

export interface SpaceLayoutProps {
  category?: DataSourceViewCategory;
  dataSourceView?: DataSourceViewType;
  isAdmin: boolean;
  owner: WorkspaceType;
  parentId?: string;
  plan: PlanType;
  space: SpaceType;
  subscription: SubscriptionType;
}

export function SpaceLayout({
  children,
  pageProps,
}: {
  children: React.ReactNode;
  pageProps: SpaceLayoutProps;
}) {
  const [spaceCreationModalState, setSpaceCreationModalState] = useState({
    isOpen: false,
    defaultRestricted: false,
  });

  const {
    owner,
    plan,
    isAdmin,
    subscription,
    space,
    category,
    dataSourceView,
    parentId,
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
        <SpaceBreadCrumbs
          space={space}
          category={category}
          owner={owner}
          dataSourceView={dataSourceView}
          parentId={parentId ?? undefined}
        />
        {children}
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

function SpaceBreadCrumbs({
  owner,
  space,
  category,
  dataSourceView,
  parentId,
}: {
  owner: WorkspaceType;
  space: SpaceType;
  category?: DataSourceViewCategory;
  dataSourceView?: DataSourceViewType;
  parentId?: string;
}) {
  const {
    nodes: [currentFolder],
  } = useDataSourceViewContentNodes({
    owner,
    dataSourceView: parentId ? dataSourceView : undefined,
    internalIds: parentId ? [parentId] : [],
    viewType: "all",
  });

  const { nodes: folders } = useDataSourceViewContentNodes({
    dataSourceView: currentFolder ? dataSourceView : undefined,
    internalIds: currentFolder?.parentInternalIds ?? [],
    owner,
    viewType: "all",
  });

  const items = useMemo(() => {
    if (!category) {
      return [];
    }

    const items: {
      label: string;
      icon?: ComponentType;
      href?: string;
    }[] = [
      {
        icon: getSpaceIcon(space),
        label: space.kind === "global" ? "Company Data" : space.name,
        href: `/w/${owner.sId}/spaces/${space.sId}`,
      },
      {
        label: CATEGORY_DETAILS[category].label,
        href: `/w/${owner.sId}/spaces/${space.sId}/categories/${category}`,
      },
    ];

    if (space.kind === "system") {
      if (!dataSourceView) {
        return [];
      }

      // For system space, we don't want the first breadcrumb to show, since
      // it's only used to manage "connected data" already. Otherwise it would
      // expose a useless link, and name would be redundant with the "Connected
      // data" label
      items.shift();
    }

    if (dataSourceView) {
      if (category === "managed" && space.kind !== "system") {
        // Remove the "Connected data" from breadcrumbs to avoid hiding the actual
        // managed connection name

        // Showing the actual managed connection name (e.g. microsoft, slack...) is
        // more important and implies clearly that we are dealing with connected
        // data
        items.pop();
      }

      items.push({
        label: getDataSourceNameFromView(dataSourceView),
        href: `/w/${owner.sId}/spaces/${space.sId}/categories/${category}/data_source_views/${dataSourceView.sId}`,
      });

      for (const node of [...folders].reverse()) {
        items.push({
          label: node.title,
          href: `/w/${owner.sId}/spaces/${space.sId}/categories/${category}/data_source_views/${dataSourceView.sId}?parentId=${node.internalId}`,
        });
      }
    }
    return items;
  }, [owner, space, category, dataSourceView, folders]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="pb-8">
      <Breadcrumbs items={items} />
    </div>
  );
}
