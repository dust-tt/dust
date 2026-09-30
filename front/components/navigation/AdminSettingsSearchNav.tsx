import type {
  AppLayoutNavigation,
  SidebarNavigation,
  SubNavigationAdminId,
} from "@app/components/navigation/config";
import { searchAdminSettingsIndex } from "@app/lib/admin/adminSearchIndex";
import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { buildAdminSettingHref } from "@app/lib/admin/buildAdminSettingHref";
import { useAppRouter } from "@app/lib/platform";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import {
  NavigationList,
  NavigationListCompactLabel,
  NavigationListItem,
  SearchInput,
} from "@dust-tt/sparkle";
import React, { useMemo, useState } from "react";

interface AdminSettingsSearchNavProps {
  subNavigation: SidebarNavigation[];
  hasFeature: (feature: WhitelistableFeature) => boolean;
}

function accessibleAdminMenus(
  subNavigation: SidebarNavigation[],
  hasFeature: (feature: WhitelistableFeature) => boolean
): Map<SubNavigationAdminId, AppLayoutNavigation> {
  const menus = new Map<SubNavigationAdminId, AppLayoutNavigation>();
  for (const section of subNavigation) {
    for (const menu of section.menus) {
      if (menu.disabled) {
        continue;
      }
      if (menu.featureFlag && !hasFeature(menu.featureFlag)) {
        continue;
      }
      menus.set(menu.id as SubNavigationAdminId, menu);
    }
  }
  return menus;
}

/**
 * Admin sidebar search: replaces the nav list with grouped setting hits while
 * the query is non-empty. Enter opens the first hit; Escape clears.
 */
export function AdminSettingsSearchNav({
  subNavigation,
  hasFeature,
}: AdminSettingsSearchNavProps) {
  const router = useAppRouter();
  const [query, setQuery] = useState("");

  const menusByPageId = useMemo(
    () => accessibleAdminMenus(subNavigation, hasFeature),
    [subNavigation, hasFeature]
  );

  const results = useMemo(() => {
    if (!query.trim()) {
      return [];
    }
    const labelFor = (pageId: string) =>
      menusByPageId.get(pageId as SubNavigationAdminId)?.label ?? pageId;
    return searchAdminSettingsIndex(query, labelFor).filter((entry) =>
      menusByPageId.has(entry.pageId)
    );
  }, [query, menusByPageId]);

  const grouped = useMemo(() => {
    const groups: {
      menu: AppLayoutNavigation;
      entries: AdminSettingEntry[];
    }[] = [];
    for (const menu of menusByPageId.values()) {
      const entries = results.filter((e) => e.pageId === menu.id);
      if (entries.length > 0) {
        groups.push({ menu, entries });
      }
    }
    return groups;
  }, [results, menusByPageId]);

  const goTo = (entry: AdminSettingEntry) => {
    const menu = menusByPageId.get(entry.pageId);
    if (!menu?.href) {
      return;
    }
    setQuery("");
    const href = buildAdminSettingHref(menu.href, entry);
    const target = new URL(href, window.location.origin);
    const samePage =
      target.pathname === window.location.pathname &&
      target.search === window.location.search;

    if (samePage) {
      // React Router updates the hash via history.pushState, which does not
      // fire `hashchange`. Assigning location.hash does, so the highlight hook
      // re-runs. Clear first when the hash is unchanged so the jump re-triggers.
      const nextHash = `#${entry.sectionId}`;
      if (window.location.hash === nextHash) {
        window.location.hash = "";
      }
      window.location.hash = entry.sectionId;
      return;
    }

    void router.push(href);
  };

  return (
    <div className="flex flex-col gap-2">
      <SearchInput
        name="admin-settings-search"
        placeholder="Search settings"
        value={query}
        onChange={setQuery}
        onKeyDown={(ev) => {
          if (ev.key === "Enter" && results[0]) {
            goTo(results[0]);
          }
          if (ev.key === "Escape") {
            setQuery("");
          }
        }}
      />
      {query.trim() ? (
        <NavigationList>
          {grouped.length === 0 ? (
            <p className="copy-sm px-2 py-3 text-muted-foreground">
              No setting matches &ldquo;{query}&rdquo;.
            </p>
          ) : (
            grouped.map(({ menu, entries }) => (
              <div key={menu.id} className="flex flex-col">
                <NavigationListItem
                  label={menu.label}
                  icon={menu.icon}
                  selected={menu.current}
                  href={menu.href}
                  onClick={() => setQuery("")}
                />
                {entries.map((entry) => (
                  <button
                    key={`${entry.sectionId}/${entry.label}`}
                    type="button"
                    title={entry.label}
                    onClick={() => goTo(entry)}
                    className="copy-sm truncate rounded-xl py-1.5 pl-9 pr-2 text-left text-muted-foreground hover:bg-muted-background hover:text-foreground"
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            ))
          )}
        </NavigationList>
      ) : (
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
      )}
    </div>
  );
}
