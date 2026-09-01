import { getConversationRoute } from "@app/lib/utils/router";
import { isString } from "@app/types/shared/utils/general";

export const USER_MENU_MODAL_QUERY_PARAM = "modal";
export const USER_MENU_GOTO_QUERY_PARAM = "goto";

export type UserMenuModal = "personal-usage" | "personal-automations";

export function isUserMenuModal(value: unknown): value is UserMenuModal {
  return (
    isString(value) &&
    (value === "personal-usage" || value === "personal-automations")
  );
}

export function getUserMenuModalRoute(
  workspaceId: string,
  modal: UserMenuModal
): string {
  return getConversationRoute(
    workspaceId,
    "new",
    `${USER_MENU_MODAL_QUERY_PARAM}=${modal}`
  );
}

export function getUserMenuModalShareRoute(modal: UserMenuModal): string {
  return `/?${USER_MENU_GOTO_QUERY_PARAM}=${modal}`;
}
