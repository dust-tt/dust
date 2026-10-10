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
 * `userLocale` MUST be the locale the user chose (`userLocale` of the auth context) when non-null,
 * otherwise the `matchBrowserLocale` of the browser's `navigator.languages` when non-null, and the
 * workspace locale (`owner.locale`) otherwise.
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

  const userLocale =
    storedUserLocale ?? matchBrowserLocale(navigator.languages) ?? owner.locale;

  const doUpdateUserLocale = async (
    locale: SupportedLocale
  ): Promise<boolean> => {
    setIsSaving(true);
    try {
      const response = await clientFetch(
        `/api/user/metadata/${encodeURIComponent(USER_LOCALE_METADATA_KEY)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: locale }),
        }
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

  return { userLocale, isSaving, doUpdateUserLocale };
}
