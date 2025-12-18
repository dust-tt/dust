import { Button, XMarkIcon } from "@dust-tt/sparkle";
import { cn } from "@dust-tt/sparkle";
import { AnimatePresence, motion } from "framer-motion";
import debounce from "lodash/debounce";
import { useCallback, useEffect, useRef, useState } from "react";

import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import type { WorkspaceType } from "@app/types";
import { isString } from "@app/types";

const BACKGROUND_IMAGE_PATH = "/static/year-in-review-bg.png";
const BACKGROUND_IMAGE_STYLE_PROPS = {
  backgroundImage: `url("${BACKGROUND_IMAGE_PATH}")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "center",
  backgroundSize: "cover",
};

const YEAR_IN_REVIEW_TITLE = "/static/year-in-review-title.svg";

const LOCAL_STORAGE_KEY_PREFIX = "dust-wrapped-dismissed";
const MENTION_BANNER_LOCAL_STORAGE_KEY = "mention-banner-dismissed";

const MENTION_BANNER_URL = "https://docs.dust.tt/docs/collaboration";

interface StackedInAppBannersProps {
  owner: WorkspaceType;
}

interface MentionBannerProps {
  showMentionBanner: boolean;
  setShowMentionBanner: (show: boolean) => void;
  isHovering: boolean;
}

interface WrappedInAppBannerProps {
  owner: WorkspaceType;
  showMentionBanner: boolean;
  isHovering: boolean;
}

function getLocalStorageKey(owner: WorkspaceType) {
  return `${LOCAL_STORAGE_KEY_PREFIX}-${owner.sId}`;
}

function getWrappedUrl(owner: WorkspaceType): string | null {
  const metadata = owner.metadata;
  if (!metadata) {
    return null;
  }
  const wrappedUrl = metadata.wrappedUrl;
  if (wrappedUrl && isString(wrappedUrl)) {
    return wrappedUrl;
  }
  return null;
}

export function StackedInAppBanners({ owner }: StackedInAppBannersProps) {
  const [showMentionBanner, setShowMentionBanner] = useState(true);
  const [ref, isHovering] = useHover();
  return (
    <div className="absolute bottom-0 left-0 z-20" ref={ref}>
      <MentionBanner
        showMentionBanner={showMentionBanner}
        setShowMentionBanner={setShowMentionBanner}
        isHovering={isHovering}
      />
      <WrappedInAppBanner
        owner={owner}
        showMentionBanner={showMentionBanner}
        isHovering={isHovering}
      />
    </div>
  );
}

export function WrappedInAppBanner({
  owner,
  showMentionBanner,
  isHovering,
}: WrappedInAppBannerProps) {
  const [showInAppBanner, setShowInAppBanner] = useState(true);
  const [innerWrappedInAppBannerRef, isWrappedInAppBannerHovering] = useHover();

  const onDismiss = (e) => {
    e.stopPropagation();
    e.preventDefault();
    localStorage.setItem(getLocalStorageKey(owner), "true");
    setShowInAppBanner(false);
  };

  const wrappedUrl = getWrappedUrl(owner);

  const onLearnMore = () => {
    window.open(wrappedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <AnimatePresence>
      {showInAppBanner ? (
        <motion.div
          transition={{ duration: 0.1, ease: "easeIn" }}
          exit={{ opacity: 0, translateY: "120%" }}
          className={cn(
            "hidden flex-col sm:flex",
            "rounded-2xl shadow-sm",
            "border border-border/0 dark:border-border-night/0",
            "mx-2 mb-2",
            showMentionBanner
              ? "translate-y-[-20%] scale-95"
              : "translate-y-0 scale-100",
            "transition-all duration-300 ease-in",
            showMentionBanner &&
              showInAppBanner &&
              (isHovering ?? isWrappedInAppBannerHovering) &&
              "translate-y-[-60%]"
          )}
          style={BACKGROUND_IMAGE_STYLE_PROPS}
        >
          <div
            className="relative w-[300px] p-4"
            onClick={withTracking(
              TRACKING_AREAS.DUST_WRAPPED,
              "cta_dust_wrapped_banner",
              onLearnMore
            )}
          >
            <img
              src={YEAR_IN_REVIEW_TITLE}
              alt="Year in Review"
              className="mb-4 h-12"
            />
            <Button
              variant="highlight"
              size="xs"
              label="Open your holiday recap"
            />
            {!showMentionBanner && (
              <Button
                variant="outline"
                icon={XMarkIcon}
                className="absolute right-1 top-1 opacity-80"
                onClick={onDismiss}
              />
            )}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function MentionBanner({
  showMentionBanner,
  setShowMentionBanner,
}: MentionBannerProps) {
  const onDismiss = () => {
    localStorage.setItem(MENTION_BANNER_LOCAL_STORAGE_KEY, "true");
    setShowMentionBanner(false);
  };

  const onLearnMore = () => {
    window.open(MENTION_BANNER_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <AnimatePresence>
      {showMentionBanner ? (
        <motion.div
          initial={
            showMentionBanner ? { opacity: 100, translateY: "100%" } : {}
          }
          transition={{ duration: 0.1, ease: "easeIn" }}
          exit={{ opacity: 0, translateY: "120%" }}
          className={cn(
            "hidden flex-col sm:flex",
            "rounded-2xl bg-white shadow-md",
            "border border-border/0 dark:border-border-night/0",
            "mx-2 mb-2",
            "relative z-10",
            "width-[300px]"
          )}
        >
          <div className="relative p-4">
            <div className="text-md mb-2 font-medium text-foreground dark:text-foreground-night">
              Introducing Triggers ✨
            </div>
            <h4 className="mb-4 text-sm font-medium leading-tight text-primary dark:text-primary-night">
              Make your agents work while you're away.
            </h4>
            <Button
              variant="highlight"
              size="xs"
              onClick={withTracking(
                TRACKING_AREAS.DUST_WRAPPED,
                "cta_dust_wrapped_banner",
                onLearnMore
              )}
              label="Learn more"
            />
            <Button
              variant="outline"
              icon={XMarkIcon}
              className="absolute right-1 top-1 opacity-80"
              onClick={onDismiss}
            />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function useHover() {
  const [hovering, setHovering] = useState(false);
  const previousNode = useRef<HTMLElement | null>(null);

  const handleMouseEnter = useCallback(() => {
    setHovering(true);
  }, []);

  // Create debounced version of handleMouseLeave
  const debouncedHandleMouseLeave = useRef(
    debounce(() => {
      setHovering(false);
    }, 300)
  ).current;

  const handleMouseLeave = useCallback(() => {
    debouncedHandleMouseLeave();
  }, [debouncedHandleMouseLeave]);

  // Cleanup debounced function on unmount
  useEffect(() => {
    return () => {
      debouncedHandleMouseLeave.cancel();
    };
  }, [debouncedHandleMouseLeave]);

  const customRef = useCallback(
    (node: HTMLElement | null) => {
      if (previousNode.current?.nodeType === Node.ELEMENT_NODE) {
        previousNode.current.removeEventListener(
          "mouseenter",
          handleMouseEnter
        );
        previousNode.current.removeEventListener(
          "mouseleave",
          handleMouseLeave
        );
      }

      if (node?.nodeType === Node.ELEMENT_NODE) {
        node.addEventListener("mouseenter", handleMouseEnter);
        node.addEventListener("mouseleave", handleMouseLeave);
      }

      previousNode.current = node;
    },
    [handleMouseEnter, handleMouseLeave]
  );

  return [customRef, hovering];
}