import type { CSSProperties } from "react";
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

const LETTER_STAGGER_MS = 25;
const LETTER_MS = 600;

// Letters show up in these colors, one after the other, then blend into the text color.
const LETTER_COLOR_CLASSES = [
  "text-blue-500",
  "text-green-500",
  "text-golden-500",
  "text-rose-500",
];

export interface PronounFill {
  input: HTMLInputElement;
  text: string;
  // Viewport box and typography of the input's text.
  textStyle: CSSProperties;
}

export function createPronounFill(
  input: HTMLInputElement,
  text: string
): PronounFill {
  const rect = input.getBoundingClientRect();
  const style = window.getComputedStyle(input);
  return {
    input,
    text,
    textStyle: {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      lineHeight: `${rect.height}px`,
      paddingLeft:
        parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft),
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      letterSpacing: style.letterSpacing,
    },
  };
}

interface PronounFillAnimationProps {
  fill: PronounFill;
  onDone: () => void;
}

/**
 * @cc [owner:aubin-tchoi,label:react] input-text-hidden-while-mounted
 * While mounted, the input's own text MUST be invisible and unmounting MUST restore it. `onDone`
 * MUST be called once the animation has ended or the user types in the input, and callers MUST
 * unmount the component when it is.
 */
export function PronounFillAnimation({
  fill,
  onDone,
}: PronounFillAnimationProps) {
  const textRef = useRef<HTMLSpanElement>(null);
  const { input } = fill;

  useLayoutEffect(() => {
    const text = textRef.current;
    if (!text) {
      return;
    }

    const textColor = window.getComputedStyle(text).color;
    // The letters stand in for the real text until the overlay unmounts.
    const hideText = input.animate(
      { color: "transparent" },
      { fill: "forwards" }
    );
    // Each letter fades in with its own color, which blends into the text color.
    const letters = Array.from(text.children, (letter, index) =>
      letter.animate(
        [
          { opacity: 0 },
          { offset: 0.3, opacity: 1 },
          { opacity: 1, color: textColor },
        ],
        { duration: LETTER_MS, delay: index * LETTER_STAGGER_MS, fill: "both" }
      )
    );
    const doneTimeout = window.setTimeout(
      onDone,
      (letters.length - 1) * LETTER_STAGGER_MS + LETTER_MS
    );
    // Typing mid-animation hands the field back right away.
    input.addEventListener("input", onDone);

    return () => {
      hideText.cancel();
      letters.forEach((letter) => letter.cancel());
      window.clearTimeout(doneTimeout);
      input.removeEventListener("input", onDone);
    };
  }, [input, onDone]);

  return createPortal(
    <span
      ref={textRef}
      aria-hidden
      className="pointer-events-none fixed z-50 whitespace-pre text-foreground"
      style={fill.textStyle}
    >
      {Array.from(fill.text, (char, index) => (
        <span
          key={index}
          className={LETTER_COLOR_CLASSES[index % LETTER_COLOR_CLASSES.length]}
        >
          {char}
        </span>
      ))}
    </span>,
    document.body
  );
}
