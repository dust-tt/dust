import { useSendNotification } from "@app/hooks/useNotification";
import { useAuth } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { useAuthContext } from "@app/lib/swr/workspaces";
import type { SupportedLocale } from "@app/types/locale";
import {
  matchBrowserLocale,
  USER_LOCALE_METADATA_KEY,
} from "@app/types/locale";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

interface UseUserLocaleProps {
  owner: LightWorkspaceType;
}

/**
 * @cc [owner:sfriquet,label:product] user-locale-resolution
 * `userLocale` MUST be `storedUserLocale`, the locale the user chose (`userLocale` of the auth
 * context, `null` when they have not chosen one), when non-null, and `automaticLocale` otherwise.
 * `automaticLocale` MUST be the `matchBrowserLocale` of the browser's `navigator.languages` when
 * non-null, with `automaticLocaleSource` `browser`, and the workspace locale (`owner.locale`)
 * otherwise, with `automaticLocaleSource` `workspace`.
 */
/**
 * @cc [owner:sfriquet,label:product] update-null-clears-user-locale
 * `doUpdateUserLocale(null)` MUST delete the locale the user chose, so that `userLocale` becomes
 * `automaticLocale`. Any other value MUST be stored as the locale the user chose.
 */
export function useUserLocale({ owner }: UseUserLocaleProps) {
  const { t } = useLingui();
  const sendNotification = useSendNotification();
  const [isSaving, setIsSaving] = useState(false);
  const { userLocale: storedUserLocale } = useAuth();
  const { mutateAuthContext } = useAuthContext({
    workspaceId: owner.sId,
    disabled: true,
  });

  const browserLocale = matchBrowserLocale(navigator.languages);
  const automaticLocale = browserLocale ?? owner.locale;
  const automaticLocaleSource = browserLocale ? "browser" : "workspace";
  const userLocale = storedUserLocale ?? automaticLocale;

  const doUpdateUserLocale = async (
    locale: SupportedLocale | null
  ): Promise<boolean> => {
    setIsSaving(true);
    try {
      const response = await clientFetch(
        `/api/user/metadata/${encodeURIComponent(USER_LOCALE_METADATA_KEY)}`,
        locale
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ value: locale }),
            }
          : { method: "DELETE" }
      ).catch(() => null);

      if (!response?.ok) {
        sendNotification({
          type: "error",
          title: t`Could not save the language`,
          description: t`Your language could not be saved to your account.`,
        });
        return false;
      }

      await mutateAuthContext();
      return true;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    userLocale,
    storedUserLocale: storedUserLocale ?? null,
    automaticLocale,
    automaticLocaleSource,
    isSaving,
    doUpdateUserLocale,
  };
}
