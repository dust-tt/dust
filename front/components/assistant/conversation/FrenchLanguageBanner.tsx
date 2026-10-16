import { useUserLocale } from "@app/hooks/useUserLocale";
import { TRACKING_AREAS, trackEvent, withTracking } from "@app/lib/tracking";
import type { WorkspaceType } from "@app/types/user";
import { Button, XClose } from "@dust-tt/sparkle";
import { m } from "framer-motion";
import { useEffect } from "react";

const FRENCH_LANGUAGE_IMAGE_PATH = "/static/French_Language_Banner.svg";
export const FRENCH_LANGUAGE_BANNER_LOCAL_STORAGE_KEY =
  "french-language-banner-dismissed";

export function isFrenchBrowser(): boolean {
  return navigator.language.toLowerCase().startsWith("fr");
}

interface FrenchLanguageBannerProps {
  owner: WorkspaceType;
  showBanner: boolean;
  onShowBanner: (open: boolean) => void;
  onOpenSettings: () => void;
}

/**
 * @cc [owner:sfriquet,label:product;react] french-copy-whatever-the-ui-locale
 * The banner's text, labels, tooltip and `alt` MUST be in French whatever the active UI
 * locale, so this file MUST NOT import a Lingui macro.
 */
/**
 * @cc [owner:sfriquet,label:product] dismissed-once-never-shown-again
 * Dismissing the banner, opening the settings from it, or switching to `fr-FR` from it, MUST set
 * `FRENCH_LANGUAGE_BANNER_LOCAL_STORAGE_KEY` to `"true"` in `localStorage` and hide it. A failed
 * switch MUST leave the banner visible and the key unset.
 */
export function FrenchLanguageBanner({
  owner,
  showBanner,
  onShowBanner,
  onOpenSettings,
}: FrenchLanguageBannerProps) {
  const { isSaving, doUpdateUserLocale } = useUserLocale({ owner });

  useEffect(() => {
    if (showBanner) {
      trackEvent({
        area: TRACKING_AREAS.CONVERSATION,
        object: "french_language_banner",
        action: "view",
      });
    }
  }, [showBanner]);

  const dismiss = () => {
    localStorage.setItem(FRENCH_LANGUAGE_BANNER_LOCAL_STORAGE_KEY, "true");
    onShowBanner(false);
  };

  const onDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dismiss();
  };

  const onSettings = () => {
    dismiss();
    onOpenSettings();
  };

  const onTryIt = async () => {
    const saved = await doUpdateUserLocale("fr-FR");
    if (saved) {
      dismiss();
    }
  };

  if (!showBanner) {
    return null;
  }

  return (
    <m.div
      initial={{ opacity: 100, translateY: "0%" }}
      transition={{ duration: 0.1, ease: "easeIn" }}
      exit={{ opacity: 0, translateY: "120%" }}
      className="relative z-10 mx-2 mb-2 hidden max-w-[300px] flex-col rounded-2xl border border-border-dark bg-background shadow-md sm:flex"
    >
      <div className="relative overflow-hidden rounded-t-2xl">
        <img
          src={FRENCH_LANGUAGE_IMAGE_PATH}
          alt="Une bulle « A » à côté d’une bulle « FR » avec le drapeau français"
          width={298}
          height={138}
          className="h-auto w-full border-b border-border-dark"
        />
        <Button
          tooltip="Fermer"
          variant="outline"
          icon={XClose}
          size="icon-xs"
          className="absolute right-1 top-1"
          onClick={withTracking(
            TRACKING_AREAS.CONVERSATION,
            "dismiss_french_language_banner",
            onDismiss
          )}
        />
      </div>
      <div className="relative px-4 py-3">
        <div className="mb-1 text-pretty text-sm font-medium text-foreground">
          Traduit pour vous 🇫🇷 Toute l’interface Dust existe maintenant en
          français.
        </div>
        <div className="mb-3 text-pretty text-xs text-muted-foreground">
          Vous pouvez choisir votre langue à tout moment dans vos{" "}
          <button
            type="button"
            className="underline hover:no-underline"
            onClick={withTracking(
              TRACKING_AREAS.CONVERSATION,
              "settings_french_language_banner",
              onSettings
            )}
          >
            paramètres
          </button>
          .
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="highlight"
            size="xs"
            label="Essayer"
            isLoading={isSaving}
            disabled={isSaving}
            onClick={withTracking(
              TRACKING_AREAS.CONVERSATION,
              "try_french_language_banner",
              onTryIt
            )}
          />
          <Button
            variant="outline"
            size="xs"
            label="Plus tard"
            disabled={isSaving}
            onClick={withTracking(
              TRACKING_AREAS.CONVERSATION,
              "later_french_language_banner",
              onDismiss
            )}
          />
        </div>
      </div>
    </m.div>
  );
}
