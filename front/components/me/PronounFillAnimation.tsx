import { cn } from "@dust-tt/sparkle";
import type { CSSProperties } from "react";
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

const LETTER_STAGGER_MS = 20;
const LETTER_ENTER_MS = 220;
const LETTER_COLOR_MS = 520;
// How far each letter starts from its slot, towards the chip it comes from.
const LETTER_TRAVEL_PX = 8;

// Letters show up in these colors, one after the other, before settling to the text color.
const LETTER_COLOR_CLASSES = [
  "text-blue-500",
  "text-green-500",
  "text-golden-500",
  "text-rose-500",
];

const EASE_OUT_CUBIC = "cubic-bezier(0.215, 0.61, 0.355, 1)";

interface PronounLetter {
  char: string;
  left: number;
  width: number;
  fromX: number;
  fromY: number;
  delayMs: number;
  colorClassName: string;
}

export interface PronounFill {
  id: number;
  input: HTMLInputElement;
  font: CSSProperties;
  // Viewport box of the input's text line.
  lineTop: number;
  lineHeight: number;
  letters: PronounLetter[];
  endMs: number;
}

interface LetterSlot {
  char: string;
  left: number;
  width: number;
}

function layoutLetters(
  text: string,
  context: CanvasRenderingContext2D
): LetterSlot[] {
  const slots: LetterSlot[] = [];
  let left = 0;
  let end = 0;
  for (const char of text) {
    end += char.length;
    // Measuring prefixes rather than single characters keeps kerning, so slots line up with the
    // text the input renders.
    const right = context.measureText(text.slice(0, end)).width;
    slots.push({ char, left, width: right - left });
    left = right;
  }
  return slots;
}

/**
 * Measures where each letter of `label` will sit in `input`, and the direction of `chip` from it.
 * Returns null when no canvas context is available to measure text.
 */
export function measurePronounFill({
  id,
  chip,
  input,
  label,
}: {
  id: number;
  chip: HTMLElement;
  input: HTMLInputElement;
  label: string;
}): PronounFill | null {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) {
    return null;
  }

  const inputStyle = window.getComputedStyle(input);
  context.font = `${inputStyle.fontStyle} ${inputStyle.fontWeight} ${inputStyle.fontSize} ${inputStyle.fontFamily}`;
  context.letterSpacing = inputStyle.letterSpacing;

  const inputRect = input.getBoundingClientRect();
  const chipRect = chip.getBoundingClientRect();
  const paddingTop = parseFloat(inputStyle.paddingTop);
  const textLeft =
    inputRect.left +
    parseFloat(inputStyle.borderLeftWidth) +
    parseFloat(inputStyle.paddingLeft);
  const lineTop =
    inputRect.top + parseFloat(inputStyle.borderTopWidth) + paddingTop;
  const lineHeight =
    input.clientHeight - paddingTop - parseFloat(inputStyle.paddingBottom);

  const letters = layoutLetters(label, context)
    .filter((slot) => slot.char.trim() !== "")
    .map((slot, index) => {
      const toChipX =
        chipRect.left +
        chipRect.width / 2 -
        (textLeft + slot.left + slot.width / 2);
      const toChipY =
        chipRect.top + chipRect.height / 2 - (lineTop + lineHeight / 2);
      const distancePx = Math.hypot(toChipX, toChipY);
      return {
        char: slot.char,
        left: textLeft + slot.left,
        width: slot.width,
        fromX: (toChipX / distancePx) * LETTER_TRAVEL_PX,
        fromY: (toChipY / distancePx) * LETTER_TRAVEL_PX,
        delayMs: index * LETTER_STAGGER_MS,
        colorClassName:
          LETTER_COLOR_CLASSES[index % LETTER_COLOR_CLASSES.length],
      };
    });

  return {
    id,
    input,
    font: {
      fontFamily: inputStyle.fontFamily,
      fontSize: inputStyle.fontSize,
      fontStyle: inputStyle.fontStyle,
      fontWeight: inputStyle.fontWeight,
      fontFeatureSettings: inputStyle.fontFeatureSettings,
      letterSpacing: inputStyle.letterSpacing,
      lineHeight: inputStyle.lineHeight,
    },
    lineTop,
    lineHeight,
    letters,
    endMs: (letters.length - 1) * LETTER_STAGGER_MS + LETTER_COLOR_MS,
  };
}

interface PronounLetterGlyphProps {
  fill: PronounFill;
  letter: PronounLetter;
}

function PronounLetterGlyph({ fill, letter }: PronounLetterGlyphProps) {
  const letterRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const element = letterRef.current;
    const overlay = element?.parentElement;
    if (!element || !overlay) {
      return;
    }

    const letterColor = window.getComputedStyle(element).color;
    const textColor = window.getComputedStyle(overlay).color;

    const animations = [
      element.animate(
        [
          {
            transform: `translate(${letter.fromX}px, ${letter.fromY}px)`,
            opacity: 0,
          },
          { transform: "translate(0px, 0px)", opacity: 1 },
        ],
        {
          duration: LETTER_ENTER_MS,
          delay: letter.delayMs,
          easing: EASE_OUT_CUBIC,
          fill: "both",
        }
      ),
      element.animate(
        [
          { offset: 0, color: letterColor },
          { offset: 0.35, color: letterColor },
          { offset: 1, color: textColor },
        ],
        {
          duration: LETTER_COLOR_MS,
          delay: letter.delayMs,
          easing: "ease",
          fill: "both",
        }
      ),
    ];

    return () => animations.forEach((animation) => animation.cancel());
  }, [letter]);

  return (
    <span
      ref={letterRef}
      className={cn(
        "absolute flex items-center justify-center",
        letter.colorClassName
      )}
      style={{
        left: letter.left,
        top: fill.lineTop,
        width: letter.width,
        height: fill.lineHeight,
      }}
    >
      {letter.char}
    </span>
  );
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
  const { input, endMs } = fill;

  useLayoutEffect(() => {
    // The letters stand in for the real text until the overlay unmounts.
    const hideText = input.animate(
      { color: "transparent" },
      { fill: "forwards" }
    );
    const doneTimeout = window.setTimeout(onDone, endMs);
    // Typing mid-animation hands the field back right away.
    input.addEventListener("input", onDone);

    return () => {
      hideText.cancel();
      window.clearTimeout(doneTimeout);
      input.removeEventListener("input", onDone);
    };
  }, [input, endMs, onDone]);

  return createPortal(
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 text-foreground"
      style={fill.font}
    >
      {fill.letters.map((letter, index) => (
        <PronounLetterGlyph key={index} fill={fill} letter={letter} />
      ))}
    </div>,
    document.body
  );
}
