import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { isAdmin } from "@app/types/user";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  ChromeLogo,
  MovingMailIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

const EXTENSION_IMAGE_PATH = "/static/Extension_Banner.png";
const EXTENSION_BANNER_LOCAL_STORAGE_KEY = "extension-banner-dismissed";
const EXTENSION_BANNER_URL =
  "https://chromewebstore.google.com/detail/dust/fnkfcndbgingjcbdhaofkcnhcjpljhdn";

const EMAIL_IMAGE_PATH = "/static/Email_Banner.png";
const EMAIL_BANNER_LOCAL_STORAGE_KEY = "email-banner-dismissed";
const EMAIL_DOCS_URL = "https://docs.dust.tt/docs/email-agents";

interface ExtensionBannerProps {
  showExtensionBanner: boolean;
  onShowExtensionBanner: (open: boolean) => void;
}

function ExtensionBanner({
  showExtensionBanner,
  onShowExtensionBanner,
}: ExtensionBannerProps) {
  const onDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    localStorage.setItem(EXTENSION_BANNER_LOCAL_STORAGE_KEY, "true");
    onShowExtensionBanner(false);
  };

  const onLearnMore = () => {
    window.open(EXTENSION_BANNER_URL, "_blank", "noopener,noreferrer");
  };

  if (!showExtensionBanner) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 100, translateY: "0%" }}
      transition={{ duration: 0.1, ease: "easeIn" }}
      exit={{ opacity: 0, translateY: "120%" }}
      className="relative z-10 mx-2 mb-2 hidden max-w-[300px] cursor-pointer flex-col rounded-2xl border border-border-dark bg-white shadow-md dark:border-border-night dark:bg-background-night sm:flex"
      onClick={withTracking(
        TRACKING_AREAS.EXTENSION,
        "cta_extension_banner",
        onLearnMore,
      )}
    >
      <div className="relative overflow-hidden rounded-t-2xl">
        <img
          src={EXTENSION_IMAGE_PATH}
          alt="Extension"
          width={300}
          height={98}
          className="h-[98px] w-[300px] border-b border-border-dark object-cover dark:border-border-night"
        />
        <Button
          variant="outline"
          icon={XMarkIcon}
          size="icon-xs"
          className="absolute right-1 top-1"
          onClick={onDismiss}
        />
      </div>
      <div className="relative px-4 py-3">
        <div className="mb-1 text-sm font-medium text-foreground dark:text-foreground-night">
          Meet the new Chrome Extension
        </div>
        <h4 className="mb-3 text-xs leading-tight text-primary dark:text-primary-night">
          Voice input, multi-tab awareness, and page interactions are here.
        </h4>
        <Button
          variant="highlight"
          size="xs"
          icon={ChromeLogo}
          label="Install the Chrome Extension"
          onClick={withTracking(
            TRACKING_AREAS.EXTENSION,
            "cta_extension_banner",
            onLearnMore,
          )}
        />
      </div>
    </motion.div>
  );
}

interface EmailBannerProps {
  owner: WorkspaceType;
  showEmailBanner: boolean;
  onShowEmailBanner: (open: boolean) => void;
}

function EmailBanner({
  owner,
  showEmailBanner,
  onShowEmailBanner,
}: EmailBannerProps) {
  const emailEnabled = owner.metadata?.allowEmailAgents === true;
  const userIsAdmin = isAdmin(owner);

  const onDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    localStorage.setItem(EMAIL_BANNER_LOCAL_STORAGE_KEY, "true");
    onShowEmailBanner(false);
  };

  const ctaUrl = emailEnabled
    ? // TODO: replace with mailto link content.
      EMAIL_DOCS_URL
    : userIsAdmin
      ? `/w/${owner.sId}/workspace`
      : null;

  const onCtaClick = ctaUrl
    ? () => {
        window.open(
          ctaUrl,
          emailEnabled ? "_blank" : "_self",
          "noopener,noreferrer",
        );
      }
    : undefined;

  if (!showEmailBanner) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 100, translateY: "0%" }}
      transition={{ duration: 0.1, ease: "easeIn" }}
      exit={{ opacity: 0, translateY: "120%" }}
      className="relative z-10 mx-2 mb-2 hidden max-w-[300px] cursor-pointer flex-col rounded-2xl border border-border-dark bg-white shadow-md dark:border-border-night dark:bg-background-night sm:flex"
      onClick={
        onCtaClick
          ? withTracking(TRACKING_AREAS.EMAIL, "cta_email_banner", onCtaClick)
          : undefined
      }
    >
      <div className="relative overflow-hidden rounded-t-2xl">
        <img
          src={EMAIL_IMAGE_PATH}
          alt="Email agents"
          width={300}
          height={98}
          className="h-[98px] w-[300px] border-b border-border-dark object-cover dark:border-border-night"
        />
        <Button
          variant="outline"
          icon={XMarkIcon}
          size="icon-xs"
          className="absolute right-1 top-1"
          onClick={onDismiss}
        />
      </div>
      <div className="relative px-4 py-3">
        <div className="mb-1 text-sm font-medium text-foreground dark:text-foreground-night">
          Email your agents
        </div>
        <h4 className="mb-3 text-xs leading-tight text-primary dark:text-primary-night">
          Forward any email to an agent — get answers right in your inbox.
        </h4>
        <EmailBannerCta
          emailEnabled={emailEnabled}
          userIsAdmin={userIsAdmin}
          onCtaClick={onCtaClick}
        />
      </div>
    </motion.div>
  );
}

interface EmailBannerCtaProps {
  emailEnabled: boolean;
  userIsAdmin: boolean;
  onCtaClick: (() => void) | undefined;
}

function EmailBannerCta({
  emailEnabled,
  userIsAdmin,
  onCtaClick,
}: EmailBannerCtaProps) {
  if (emailEnabled) {
    return (
      <Button
        variant="highlight"
        size="xs"
        icon={MovingMailIcon}
        label="Try it now"
        onClick={
          onCtaClick
            ? withTracking(TRACKING_AREAS.EMAIL, "cta_email_banner", onCtaClick)
            : undefined
        }
      />
    );
  }

  if (userIsAdmin) {
    return (
      <Button
        variant="highlight"
        size="xs"
        icon={MovingMailIcon}
        label="Enable in settings"
        onClick={
          onCtaClick
            ? withTracking(TRACKING_AREAS.EMAIL, "cta_email_banner", onCtaClick)
            : undefined
        }
      />
    );
  }

  return (
    <p className="text-xs text-muted-foreground dark:text-muted-foreground-night">
      Ask your admin to enable email agents.
    </p>
  );
}

interface StackedInAppBannersProps {
  owner: WorkspaceType;
}

export function StackedInAppBanners({ owner }: StackedInAppBannersProps) {
  const [showExtensionBanner, setShowExtensionBanner] = useState(() => {
    return localStorage.getItem(EXTENSION_BANNER_LOCAL_STORAGE_KEY) !== "true";
  });
  const [showEmailBanner, setShowEmailBanner] = useState(() => {
    return localStorage.getItem(EMAIL_BANNER_LOCAL_STORAGE_KEY) !== "true";
  });

  return (
    <AnimatePresence>
      <EmailBanner
        key="email-banner"
        owner={owner}
        showEmailBanner={showEmailBanner}
        onShowEmailBanner={setShowEmailBanner}
      />
      <ExtensionBanner
        key="extension-banner"
        showExtensionBanner={showExtensionBanner}
        onShowExtensionBanner={setShowExtensionBanner}
      />
    </AnimatePresence>
  );
}
