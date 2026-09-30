import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useUserMetadata } from "@app/lib/swr/user";
import type { SupportedLocale } from "@app/types/locale";
import { isSupportedLocale, USER_LOCALE_METADATA_KEY } from "@app/types/locale";
import type { LightWorkspaceType } from "@app/types/user";
import { useState } from "react";

interface UseUserLocaleProps {
  owner: LightWorkspaceType;
  disabled?: boolean;
}

/**
 * @cc [owner:sfriquet,label:product] user-locale-defaults-to-workspace-locale
 * `userLocale` MUST be the locale stored in the user's global `locale` metadata when it is one of
 * `SUPPORTED_LOCALES`, and MUST be `owner.locale` in every other case: no stored value, value
 * still loading, hook disabled, or a stored value that is not a supported locale.
 */
export function useUserLocale({ owner, disabled }: UseUserLocaleProps) {
  const sendNotification = useSendNotification();
  const [isSaving, setIsSaving] = useState(false);
  const { metadata, mutateMetadata } = useUserMetadata(
    USER_LOCALE_METADATA_KEY,
    { disabled }
  );

  const storedLocale = metadata?.value;
  const userLocale = isSupportedLocale(storedLocale)
    ? storedLocale
    : owner.locale;

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
          title: "Could not save the language",
          description: "Your language could not be saved to your account.",
        });
        return false;
      }

      await mutateMetadata();
      return true;
    } finally {
      setIsSaving(false);
    }
  };

  return { userLocale, isSaving, doUpdateUserLocale };
}
