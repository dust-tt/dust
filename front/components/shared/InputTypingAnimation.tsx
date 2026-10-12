import { TypingAnimation } from "@dust-tt/sparkle";
import type { CSSProperties } from "react";
import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

function getInputTextStyle(input: HTMLInputElement): CSSProperties {
  const rect = input.getBoundingClientRect();
  const style = window.getComputedStyle(input);
  return {
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
  };
}

interface InputTypingAnimationProps {
  input: HTMLInputElement;
  text: string;
  onDone: () => void;
}

/**
 * Types `text` over `input`, e.g. after setting its value from a suggestion. The input's own text
 * stays hidden while this is mounted: unmount it on `onDone`, called once `text` is typed or when
 * the user types in the input.
 */
export function InputTypingAnimation({
  input,
  text,
  onDone,
}: InputTypingAnimationProps) {
  const [textStyle] = useState(() => getInputTextStyle(input));

  useLayoutEffect(() => {
    const hideText = input.animate(
      { color: "transparent" },
      { fill: "forwards" }
    );
    input.addEventListener("input", onDone);

    return () => {
      hideText.cancel();
      input.removeEventListener("input", onDone);
    };
  }, [input, onDone]);

  // Portaled so it can sit over inputs in dialogs, hence the dialogs' z-index.
  return createPortal(
    <span
      aria-hidden
      className="pointer-events-none fixed z-50 whitespace-pre text-foreground"
      style={textStyle}
    >
      <TypingAnimation text={text} onComplete={onDone} />
    </span>,
    document.body
  );
}
