import { useHashParam } from "@app/hooks/useHashParams";
import { useAppRouter } from "@app/lib/platform";
import type { UserMenuModal } from "@app/lib/user_menu";
import {
  isUserMenuModal,
  USER_MENU_MODAL_QUERY_PARAM,
} from "@app/lib/user_menu";
import { useEffect } from "react";

/**
 * @cc [owner:aubin-tchoi,label:product] user-menu-modal-url-state
 * The hash `modal` parameter selects the user-menu dialog; unsupported values open
 * none, and closing a dialog removes only that parameter.
 */
/**
 * @cc [owner:aubin-tchoi,label:product] legacy-user-menu-modal-links
 * Supported query-string `modal` links must open the requested dialog and migrate
 * to the hash without removing unrelated query or hash parameters.
 */
export function useUserMenuModal(): [
  UserMenuModal | undefined,
  (modal?: UserMenuModal) => void,
] {
  const router = useAppRouter();
  const [modal, setModal] = useHashParam(USER_MENU_MODAL_QUERY_PARAM);
  const queryModal = router.query[USER_MENU_MODAL_QUERY_PARAM];

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    if (isUserMenuModal(queryModal)) {
      const query = { ...router.query };
      delete query[USER_MENU_MODAL_QUERY_PARAM];

      void router
        .replace(
          { pathname: router.pathname, query, hash: window.location.hash },
          undefined,
          { shallow: true }
        )
        .then(() => setModal(queryModal));
      return;
    }

    // SPA navigation uses pushState, which does not emit hashchange. Read the
    // current location so a hash written by useHashParam is not overwritten.
    const [, hashQuery] = window.location.hash.split("?");
    const hashParams = new URLSearchParams(hashQuery);
    setModal(hashParams.get(USER_MENU_MODAL_QUERY_PARAM) ?? undefined);
  }, [router, queryModal, setModal]);

  return [isUserMenuModal(modal) ? modal : undefined, setModal];
}
