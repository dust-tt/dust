import { TypingAnimation } from "@sparkle/components/TypingAnimation";
import React, { type CSSProperties, useLayoutEffect, useState } from "react";
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

export interface InputTypingAnimationProps {
  /** The input to type over; its own text stays hidden while this is mounted. */
  input: HTMLInputElement;
  /** The text to type, usually the value just set on the input. */
  text: string;
  /** Called once the text is typed, or as soon as the user types in the input. Unmount on it. */
  onDone: () => void;
}

/**
 * Types `text` over an input with TypingAnimation, e.g. right after setting its value from a
 * suggestion. A native input cannot render animated text, so the typing is drawn over it while
 * the input's own text is hidden; unmount the component on `onDone` to show it again.
 *
 * @summary Typing effect over an input.
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
