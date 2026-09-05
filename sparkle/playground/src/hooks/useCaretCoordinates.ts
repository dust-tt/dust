import { useLayoutEffect, useState } from "react";
import type { RefObject } from "react";

interface CaretCoordinates {
  top: number;
  left: number;
}

const ZERO: CaretCoordinates = { top: 0, left: 0 };

// Every text-affecting style has to match the real textarea for the mirror
// to wrap identically — otherwise the measured caret position drifts from
// the real one as soon as the text wraps onto a second line.
const MIRRORED_PROPERTIES = [
  "boxSizing",
  "width",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "wordSpacing",
  "tabSize",
  "whiteSpace",
  "wordBreak",
] as const;

/**
 * Measures where the caret sits inside a `<textarea>` by rendering an
 * invisible mirror `<div>` with identical text-affecting styles, filling it
 * with the text up to the caret, and reading the offset of a marker span
 * placed right after it. Textareas have no native API for this.
 */
export function useCaretCoordinates(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  value: string,
  caretIndex: number,
  enabled: boolean
): CaretCoordinates {
  const [coords, setCoords] = useState<CaretCoordinates>(ZERO);

  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const computedStyle = window.getComputedStyle(textarea);
    const mirror = document.createElement("div");
    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.top = "0";
    mirror.style.left = "-9999px";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.overflowWrap = "break-word";

    for (const property of MIRRORED_PROPERTIES) {
      mirror.style[property] = computedStyle[property];
    }

    mirror.textContent = value.slice(0, caretIndex);
    const marker = document.createElement("span");
    marker.textContent = "​";
    mirror.appendChild(marker);

    document.body.appendChild(mirror);
    setCoords({
      top: marker.offsetTop - textarea.scrollTop,
      left: marker.offsetLeft - textarea.scrollLeft,
    });
    document.body.removeChild(mirror);
  }, [textareaRef, value, caretIndex, enabled]);

  return coords;
}
