import { AppMenu } from "@app/components/app/AppMenu";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { useApps } from "@app/lib/swr/top_level_apps";
import { getAppRoute, getNewAppRoute } from "@app/lib/utils/router";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListItem,
  NavigationListItemAction,
  Plus,
  PuzzlePiece01,
  Spinner,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface AppsSidebarSectionProps {
  owner: WorkspaceType;
}

const VISIBLE_APPS = 4;

/**
 * Apps as a top-level concept, listed next to Pods. An App is a Pod carrying `isApp`, and the Pods
 * summary excludes those, so a Pod never shows up in both sections.
 */
export function AppsSidebarSection({ owner }: AppsSidebarSectionProps) {
  const { hasFeature } = useFeatureFlags();
  const router = useAppRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isEnabled = hasFeature("top_level_apps");
  const { apps, isAppsLoading } = useApps({ owner, disabled: !isEnabled });

  if (!isEnabled) {
    return null;
  }

  const newAppRoute = getNewAppRoute(owner.sId);

  return (
    <NavigationList className="mx-sidebar-side-spacing flex-shrink-0">
      <NavigationListCollapsibleSection
        label="Apps"
        type="collapse"
        visibleItems={VISIBLE_APPS}
        open={!isCollapsed}
        onOpenChange={(open) => setIsCollapsed(!open)}
        action={
          apps.length > 0 && (
            <Button
              size="xs"
              icon={Plus}
              label="New"
              variant="ghost-secondary"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void router.push(newAppRoute);
              }}
            />
          )
        }
      >
        {isAppsLoading ? (
          <div className="flex items-center justify-center">
            <Spinner size="xs" />
          </div>
        ) : apps.length > 0 ? (
          apps.map((app) => {
            const route = getAppRoute(owner.sId, app.sId);
            return (
              <NavigationListItem
                key={app.sId}
                label={app.name}
                icon={PuzzlePiece01}
                href={route}
                selected={router.asPath?.startsWith(route)}
                moreMenu={
                  <AppMenu
                    owner={owner}
                    app={app}
                    trigger={<NavigationListItemAction />}
                  />
                }
              />
            );
          })
        ) : (
          <NavigationListItem
            label="Create an App"
            icon={Plus}
            href={newAppRoute}
          />
        )}
      </NavigationListCollapsibleSection>
    </NavigationList>
  );
}
