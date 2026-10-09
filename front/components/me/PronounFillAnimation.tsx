import type { CSSProperties } from "react";
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

const LETTER_STAGGER_MS = 18;
const LIFT_OFF_MS = 80;
const FLIGHT_BASE_MS = 300;
const FLIGHT_MS_PER_TRAVEL_PX = 0.4;
const FLIGHT_MAX_MS = 420;
const FADE_OUT_MS = 160;

const HOP_BASE_PX = 4;
const HOP_PER_TRAVEL_PX = 0.04;
const HOP_MAX_PX = 10;

const EASE_OUT_QUAD = "cubic-bezier(0.25, 0.46, 0.45, 0.94)";
const EASE_IN_OUT_QUAD = "cubic-bezier(0.455, 0.03, 0.515, 0.955)";

interface IncomingLetter {
  char: string;
  left: number;
  width: number;
  // Offset from the letter's slot in the input to its glyph in the chip.
  fromX: number;
  fromY: number;
  delayMs: number;
  flightMs: number;
  hopPx: number;
}

interface OutgoingLetter {
  char: string;
  left: number;
  width: number;
}

export interface PronounFlight {
  id: number;
  input: HTMLInputElement;
  font: CSSProperties;
  // Viewport box of the input's text line.
  lineTop: number;
  lineHeight: number;
  chipFontScale: number;
  incoming: IncomingLetter[];
  outgoing: OutgoingLetter[];
  landedAtMs: number;
}

interface LetterSlot {
  char: string;
  offset: number;
  left: number;
  width: number;
}

function layoutLetters(
  text: string,
  context: CanvasRenderingContext2D
): LetterSlot[] {
  const slots: LetterSlot[] = [];
  let offset = 0;
  let left = 0;
  for (const char of text) {
    // Measuring prefixes rather than single characters keeps kerning, so slots line up with the
    // text the input renders.
    const right = context.measureText(
      text.slice(0, offset + char.length)
    ).width;
    slots.push({ char, offset, left, width: right - left });
    offset += char.length;
    left = right;
  }
  return slots;
}

function findTextNode(root: HTMLElement, text: string): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof Text && node.data === text) {
      return node;
    }
  }
  return null;
}

/**
 * Measures where each letter of `label` sits in `chip` and where it will sit in `input`, and where
 * the letters currently shown in `input` are. Must be called before the input value changes.
 * Returns null when the chip does not render `label` as a text node.
 */
export function measurePronounFlight({
  id,
  chip,
  input,
  label,
}: {
  id: number;
  chip: HTMLElement;
  input: HTMLInputElement;
  label: string;
}): PronounFlight | null {
  const labelNode = findTextNode(chip, label);
  const context = document.createElement("canvas").getContext("2d");
  if (!labelNode || !context) {
    return null;
  }

  const inputStyle = window.getComputedStyle(input);
  context.font = `${inputStyle.fontStyle} ${inputStyle.fontWeight} ${inputStyle.fontSize} ${inputStyle.fontFamily}`;
  context.letterSpacing = inputStyle.letterSpacing;

  const inputRect = input.getBoundingClientRect();
  const paddingTop = parseFloat(inputStyle.paddingTop);
  const textLeft =
    inputRect.left +
    parseFloat(inputStyle.borderLeftWidth) +
    parseFloat(inputStyle.paddingLeft);
  const textRight =
    inputRect.right -
    parseFloat(inputStyle.borderRightWidth) -
    parseFloat(inputStyle.paddingRight);
  const lineTop =
    inputRect.top + parseFloat(inputStyle.borderTopWidth) + paddingTop;
  const lineHeight =
    input.clientHeight - paddingTop - parseFloat(inputStyle.paddingBottom);
  const lineCenter = lineTop + lineHeight / 2;

  const range = document.createRange();
  const incoming = layoutLetters(label, context)
    .filter((slot) => slot.char.trim() !== "")
    .map((slot, index) => {
      range.setStart(labelNode, slot.offset);
      range.setEnd(labelNode, slot.offset + slot.char.length);
      const glyph = range.getBoundingClientRect();
      const fromX =
        glyph.left + glyph.width / 2 - (textLeft + slot.left + slot.width / 2);
      const fromY = glyph.top + glyph.height / 2 - lineCenter;
      const travelPx = Math.hypot(fromX, fromY);
      return {
        char: slot.char,
        left: textLeft + slot.left,
        width: slot.width,
        fromX,
        fromY,
        delayMs: index * LETTER_STAGGER_MS,
        flightMs: Math.min(
          FLIGHT_BASE_MS + travelPx * FLIGHT_MS_PER_TRAVEL_PX,
          FLIGHT_MAX_MS
        ),
        hopPx: Math.min(HOP_BASE_PX + travelPx * HOP_PER_TRAVEL_PX, HOP_MAX_PX),
      };
    });

  const outgoing = layoutLetters(input.value, context)
    .map((slot) => ({
      char: slot.char,
      left: textLeft - input.scrollLeft + slot.left,
      width: slot.width,
    }))
    .filter(
      (letter) =>
        letter.char.trim() !== "" &&
        letter.left >= textLeft &&
        letter.left + letter.width <= textRight
    );

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
    chipFontScale:
      parseFloat(window.getComputedStyle(chip).fontSize) /
      parseFloat(inputStyle.fontSize),
    incoming,
    outgoing,
    landedAtMs: Math.max(
      ...incoming.map((letter) => letter.delayMs + letter.flightMs)
    ),
  };
}

interface IncomingLetterGlyphProps {
  flight: PronounFlight;
  letter: IncomingLetter;
}

function IncomingLetterGlyph({ flight, letter }: IncomingLetterGlyphProps) {
  const slotRef = useRef<HTMLSpanElement>(null);
  const arcRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const slot = slotRef.current;
    const arc = arcRef.current;
    if (!slot || !arc) {
      return;
    }

    const { fromX, fromY, hopPx, delayMs, flightMs } = letter;
    // Under constant gravity, the time spent climbing to the apex and coming down from it grows
    // with the square root of each height, which keeps the arc smooth whatever the chip position.
    const apexY = Math.min(fromY, 0) - hopPx;
    const climb = Math.sqrt(fromY - apexY);
    const drop = Math.sqrt(-apexY);
    const flightTiming: KeyframeAnimationOptions = {
      duration: flightMs,
      delay: delayMs,
      fill: "both",
    };

    const animations = [
      slot.animate(
        [
          { transform: `translateX(${fromX}px)` },
          { transform: "translateX(0px)" },
        ],
        { ...flightTiming, easing: EASE_IN_OUT_QUAD }
      ),
      slot.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: LIFT_OFF_MS,
        delay: delayMs,
        fill: "both",
      }),
      arc.animate(
        [
          {
            transform: `translateY(${fromY}px) scale(${flight.chipFontScale})`,
            easing: EASE_OUT_QUAD,
          },
          {
            offset: climb / (climb + drop),
            transform: `translateY(${apexY}px) scale(1)`,
            easing: EASE_IN_OUT_QUAD,
          },
          { transform: "translateY(0px) scale(1)" },
        ],
        flightTiming
      ),
    ];

    return () => animations.forEach((animation) => animation.cancel());
  }, [flight, letter]);

  return (
    <span
      ref={slotRef}
      className="absolute flex items-center justify-center"
      style={{
        left: letter.left,
        top: flight.lineTop,
        width: letter.width,
        height: flight.lineHeight,
      }}
    >
      <span ref={arcRef} className="inline-block">
        {letter.char}
      </span>
    </span>
  );
}

interface OutgoingLetterGlyphProps {
  flight: PronounFlight;
  letter: OutgoingLetter;
}

function OutgoingLetterGlyph({ flight, letter }: OutgoingLetterGlyphProps) {
  const glyphRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const glyph = glyphRef.current;
    if (!glyph) {
      return;
    }

    const animation = glyph.animate(
      [
        { transform: "translateY(0px)", opacity: 1 },
        { transform: "translateY(4px)", opacity: 0 },
      ],
      { duration: FADE_OUT_MS, easing: EASE_OUT_QUAD, fill: "both" }
    );

    return () => animation.cancel();
  }, [flight]);

  return (
    <span
      className="absolute flex items-center justify-center"
      style={{
        left: letter.left,
        top: flight.lineTop,
        width: letter.width,
        height: flight.lineHeight,
      }}
    >
      <span ref={glyphRef} className="inline-block">
        {letter.char}
      </span>
    </span>
  );
}

interface PronounFillAnimationProps {
  flight: PronounFlight;
  onDone: () => void;
}

/**
 * @cc [owner:aubin-tchoi,label:react] input-text-hidden-while-mounted
 * While mounted, the input's own text MUST be invisible and unmounting MUST restore it. `onDone`
 * MUST be called once the animation has ended or the user types in the input, and callers MUST
 * unmount the component when it is.
 */
export function PronounFillAnimation({
  flight,
  onDone,
}: PronounFillAnimationProps) {
  const { input, landedAtMs } = flight;

  useLayoutEffect(() => {
    // The letters stand in for the real text until the overlay unmounts.
    const hideText = input.animate(
      { color: "transparent" },
      { fill: "forwards" }
    );
    const doneTimeout = window.setTimeout(onDone, landedAtMs);
    // Typing mid-flight hands the field back right away.
    input.addEventListener("input", onDone);

    return () => {
      hideText.cancel();
      window.clearTimeout(doneTimeout);
      input.removeEventListener("input", onDone);
    };
  }, [input, landedAtMs, onDone]);

  return createPortal(
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 text-foreground"
      style={flight.font}
    >
      {flight.outgoing.map((letter, index) => (
        <OutgoingLetterGlyph key={index} flight={flight} letter={letter} />
      ))}
      {flight.incoming.map((letter, index) => (
        <IncomingLetterGlyph key={index} flight={flight} letter={letter} />
      ))}
    </div>,
    document.body
  );
}
