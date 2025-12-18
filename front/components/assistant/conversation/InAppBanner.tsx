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
  showWrappedInAppBanner: boolean;
}

interface WrappedInAppBannerProps {
  owner: WorkspaceType;
  showMentionBanner: boolean;
  isHovering: boolean;
  showWrappedInAppBanner: boolean;
  setShowWrappedInAppBanner: (show: boolean) => void;
}

function getLocalStorageKey(owner: WorkspaceType) {
  return `${LOCAL_STORAGE_KEY_PREFIX}-${owner.sId}`;
}

function getWrappedUrl(owner: WorkspaceType): string | null {
  return null;
  const metadata = owner.metadata;
  if (!metadata) {
    return null;
  }
  const wrappedUrl = metadata.wrappedUrl;

  return wrappedUrl;
  if (wrappedUrl && isString(wrappedUrl)) {
    return wrappedUrl;
  }
  return null;
}

export function StackedInAppBanners({ owner }: StackedInAppBannersProps) {
  const [showWrappedInAppBanner, setShowWrappedInAppBanner] = useState(() => {
    return localStorage.getItem(getLocalStorageKey(owner)) !== "true";
  });
  const [showMentionBanner, setShowMentionBanner] = useState(() => {
    return localStorage.getItem(MENTION_BANNER_LOCAL_STORAGE_KEY) !== "true";
  });
  const [ref, isHovering] = useHover();

  return (
    <div className="absolute bottom-0 left-0 z-20 w-full" ref={ref}>
      <MentionBanner
        showWrappedInAppBanner={showWrappedInAppBanner}
        showMentionBanner={showMentionBanner}
        setShowMentionBanner={setShowMentionBanner}
        isHovering={isHovering}
      />
      <WrappedInAppBanner
        owner={owner}
        showWrappedInAppBanner={showWrappedInAppBanner}
        setShowWrappedInAppBanner={setShowWrappedInAppBanner}
        showMentionBanner={showMentionBanner}
        isHovering={isHovering}
      />
    </div>
  );
}

export function WrappedInAppBanner({
  owner,
  showWrappedInAppBanner,
  setShowWrappedInAppBanner,
  showMentionBanner,
  isHovering,
}: WrappedInAppBannerProps) {
  const onDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    localStorage.setItem(getLocalStorageKey(owner), "true");
    setShowWrappedInAppBanner(false);
  };

  const wrappedUrl = getWrappedUrl(owner);

  const onLearnMore = () => {
    if (wrappedUrl) {
      window.open(wrappedUrl, "_blank", "noopener,noreferrer");
    }
  };

  const isBehindMentionBanner = showMentionBanner;
  const shouldShowHoverState =
    isBehindMentionBanner && showWrappedInAppBanner && isHovering;

  return (
    <AnimatePresence>
      {showWrappedInAppBanner ? (
        <motion.div
          transition={{ duration: 0.1, ease: "easeIn" }}
          exit={{ opacity: 0, translateY: "120%" }}
          className={cn(
            "hidden flex-col sm:flex",
            "rounded-2xl shadow-sm",
            "border border-border/0 dark:border-border-night/0",
            "mx-2 mb-2",
            isBehindMentionBanner
              ? "translate-y-[-20%] scale-95"
              : "translate-y-0 scale-100",
            "transition-all duration-300 ease-in",
            shouldShowHoverState && "translate-y-[-50%]"
          )}
          style={BACKGROUND_IMAGE_STYLE_PROPS}
        >
          <div
            className="relative cursor-pointer p-4"
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
  showWrappedInAppBanner,
  setShowMentionBanner,
}: MentionBannerProps) {
  const onDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    localStorage.setItem(MENTION_BANNER_LOCAL_STORAGE_KEY, "true");
    setShowMentionBanner(false);
  };

  const onLearnMore = () => {
    window.open(MENTION_BANNER_URL, "_blank", "noopener,noreferrer");
  };

  const hasBothBanners = showMentionBanner && showWrappedInAppBanner;

  return (
    <AnimatePresence>
      {showMentionBanner ? (
        <motion.div
          initial={hasBothBanners ? { opacity: 100, translateY: "100%" } : {}}
          transition={{ duration: 0.1, ease: "easeIn" }}
          exit={{ opacity: 0, translateY: "120%" }}
          className={cn(
            "hidden flex-col sm:flex",
            "rounded-2xl bg-white shadow-md",
            "border border-border/0 dark:border-border-night/0",
            "mx-2 mb-2",
            "relative z-10"
          )}
        >
          <div className="relative cursor-pointer p-4" onClick={onLearnMore}>
            <div className="text-md mb-2 font-medium text-foreground dark:text-foreground-night">
              Introducing Collaboration ✨
            </div>
            <h4 className="mb-4 text-sm font-medium leading-tight text-primary dark:text-primary-night">
              Collaborate with your team on Dust
            </h4>
            <Button
              variant="highlight"
              size="xs"
              onClick={withTracking(
                TRACKING_AREAS.MENTIONS,
                "cta_collaboration_banner",
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

function useHover(): [(node: HTMLElement | null) => void, boolean] {
  const [hovering, setHovering] = useState(false);
  const previousNode = useRef<HTMLElement | null>(null);
  const debouncedHandleMouseLeaveRef = useRef(
    debounce(() => {
      setHovering(false);
    }, 300)
  );

  const handleMouseEnter = useCallback(() => {
    setHovering(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    debouncedHandleMouseLeaveRef.current();
  }, []);

  // Cleanup debounced function on unmount
  useEffect(() => {
    const debouncedFn = debouncedHandleMouseLeaveRef.current;
    return () => {
      debouncedFn.cancel();
    };
  }, []);

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