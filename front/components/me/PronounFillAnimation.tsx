import type { CSSProperties } from "react";
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

const LETTER_STAGGER_MS = 20;
const LETTER_MS = 200;

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

    // The letters stand in for the real text until the overlay unmounts.
    const hideText = input.animate(
      { color: "transparent" },
      { fill: "forwards" }
    );
    // The letters fade in one after the other.
    const letters = Array.from(text.children, (letter, index) =>
      letter.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: LETTER_MS,
        delay: index * LETTER_STAGGER_MS,
        easing: "ease-out",
        fill: "both",
      })
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
        <span key={index}>{char}</span>
      ))}
    </span>,
    document.body
  );
}
