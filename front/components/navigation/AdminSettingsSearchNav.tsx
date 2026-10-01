import { useCommandPalette } from "@app/components/command_palette/CommandPaletteContext";
import type { SidebarNavigation } from "@app/components/navigation/config";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import {
  Button,
  NavigationList,
  NavigationListCompactLabel,
  NavigationListItem,
  SearchMd,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import React from "react";

interface AdminSettingsSearchNavProps {
  subNavigation: SidebarNavigation[];
  hasFeature: (feature: WhitelistableFeature) => boolean;
}

/**
 * Admin sidebar: search affordance opens the command palette (Settings results
 * for admins), with the usual admin nav list below.
 */
export function AdminSettingsSearchNav({
  subNavigation,
  hasFeature,
}: AdminSettingsSearchNavProps) {
  const { t } = useLingui();
  const { open: openCommandPalette } = useCommandPalette();

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        size="sm"
        icon={SearchMd}
        label={t`Search settings`}
        onClick={() => openCommandPalette({ category: "Settings" })}
        className="w-full justify-start"
      />
      <NavigationList>
        {subNavigation.map((nav) => (
          <React.Fragment key={`nav-${nav.label}`}>
            {nav.label && <NavigationListCompactLabel label={nav.label} />}
            {nav.menus
              .filter(
                (menu) => !menu.featureFlag || hasFeature(menu.featureFlag)
              )
              .map((menu) => (
                <NavigationListItem
                  key={menu.id}
                  selected={menu.current}
                  disabled={menu.disabled}
                  label={menu.label}
                  icon={menu.icon}
                  href={menu.href}
                  target={menu.target}
                />
              ))}
          </React.Fragment>
        ))}
      </NavigationList>
    </div>
  );
}
