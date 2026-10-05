import type {
  AppLayoutNavigation,
  SidebarNavigation,
  SubNavigationAdminId,
} from "@app/components/navigation/config";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

/** Menus the current user can open from the admin sidebar (enabled + flagged). */
export function accessibleAdminMenus(
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
