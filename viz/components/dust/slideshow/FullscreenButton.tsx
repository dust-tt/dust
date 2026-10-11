import Maximize01 from "@dust-tt/sparkle/dist/esm/icons/v2-stroke/Maximize01";
import Minimize01 from "@dust-tt/sparkle/dist/esm/icons/v2-stroke/Minimize01";
import { useLingui } from "@lingui/react/macro";
import {
  SLIDESHOW_BUTTON_CLASS_NAME,
  SLIDESHOW_ICON_CLASS_NAME,
} from "@viz/components/dust/slideshow/styles";
import { Button } from "@viz/components/ui/button";
import { cn } from "@viz/lib/utils";
import { LoaderCircle } from "lucide-react";
import { type RefObject, useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface FullscreenButtonProps {
  containerRef: RefObject<HTMLElement>;
}

/**
 * @cc [owner:flvndvd,label:react] fullscreen-button-mount
 * The button MUST mount together with a presentation container that is not yet fullscreen.
 */
/**
 * @cc [owner:flvndvd,label:react] native-fullscreen-state
 * Fullscreen MUST target the existing presentation container without remounting its
 * content. State MUST follow browser exits (including Escape). Rejected requests MUST
 * leave navigation usable and display an error inside that container.
 */
export function FullscreenButton({ containerRef }: FullscreenButtonProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const { t } = useLingui();
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setIsSupported(document.fullscreenEnabled === true);

    const updateFullscreen = () => {
      setIsFullscreen(
        document.fullscreenElement != null &&
          document.fullscreenElement === containerRef.current
      );
    };
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () =>
      document.removeEventListener("fullscreenchange", updateFullscreen);
  }, [containerRef]);

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container || isPending) {
      return;
    }
    setIsPending(true);
    setHasError(false);
    try {
      if (document.fullscreenElement === container) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen({ navigationUI: "hide" });
      }
    } catch {
      setHasError(true);
    } finally {
      setIsPending(false);
    }
  };

  const label = isFullscreen ? t`Exit fullscreen` : t`Enter fullscreen`;
  const Icon = isPending
    ? LoaderCircle
    : isFullscreen
      ? Minimize01
      : Maximize01;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={SLIDESHOW_BUTTON_CLASS_NAME}
        aria-label={label}
        aria-pressed={isFullscreen}
        aria-busy={isPending}
        title={
          isSupported ? label : t`Fullscreen is unavailable in this browser`
        }
        disabled={!isSupported || isPending}
        onClick={() => {
          void toggleFullscreen();
        }}
      >
        <Icon
          className={cn(SLIDESHOW_ICON_CLASS_NAME, isPending && "animate-spin")}
          aria-hidden="true"
        />
      </Button>
      {hasError &&
        containerRef.current &&
        createPortal(
          <div
            role="alert"
            className="absolute bottom-20 left-1/2 z-50 max-w-full -translate-x-1/2 rounded-xl bg-background px-4 py-2 text-sm text-foreground shadow-md"
          >
            {t`Fullscreen could not be changed. Please try again.`}
          </div>,
          containerRef.current
        )}
    </>
  );
}
