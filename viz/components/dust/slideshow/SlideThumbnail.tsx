import type { PropsWithChildren, ReactNode, RefAttributes } from "react";
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const PREVIEW_SIZE = { width: 1920, height: 1080 };

/**
 * @cc [owner:flvndvd,label:product] complete-slide-preview
 * Previews MUST lay out slides on a fixed 16:9 canvas, independent of the live
 * presentation's dimensions, and scale the whole canvas to fill the thumbnail.
 * They MUST preserve slide styling and remain hidden from assistive technology
 * and inert to pointer and keyboard input.
 */
export function SlideThumbnail({ slide }: { slide: ReactNode }) {
  const thumbnailRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const thumbnail = thumbnailRef.current;
    if (!thumbnail) {
      return;
    }
    thumbnail.inert = true;

    const measure = () => {
      setWidth(thumbnail.getBoundingClientRect().width);
    };
    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(thumbnail);

    const intersectionObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setIsVisible(true);
        intersectionObserver.disconnect();
      }
    });
    intersectionObserver.observe(thumbnail);

    return () => {
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, []);

  const preview = useMemo(
    () => (isVisible ? cloneSlideForPreview(slide) : null),
    [isVisible, slide]
  );
  const scale = width / PREVIEW_SIZE.width;

  return (
    <div
      ref={thumbnailRef}
      aria-hidden="true"
      className="pointer-events-none relative aspect-video w-full overflow-hidden bg-background select-none"
    >
      {isVisible && scale > 0 && (
        <div
          className="@container absolute left-0 top-0 origin-top-left"
          style={{
            width: PREVIEW_SIZE.width,
            height: PREVIEW_SIZE.height,
            transform: `scale(${scale})`,
          }}
        >
          {preview}
        </div>
      )}
    </div>
  );
}

/**
 * @cc [owner:flvndvd,label:react] preview-element-refs
 * Elements copied through the slide's children tree MUST NOT attach their authored
 * refs in previews. Cloning MUST preserve keyed identity, other props, and single-child shape.
 */
function cloneSlideForPreview(slide: ReactNode): ReactNode {
  if (typeof slide === "object" && slide !== null && Symbol.iterator in slide) {
    return Children.map(slide, cloneSlideForPreview);
  }
  if (!isValidElement<PropsWithChildren<RefAttributes<unknown>>>(slide)) {
    return slide;
  }
  return cloneElement(slide, {
    ref: null,
    ...(slide.props.children !== undefined && {
      children: cloneSlideForPreview(slide.props.children),
    }),
  });
}
