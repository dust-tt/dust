import { cn } from "@dust-tt/sparkle";
import type { CSSProperties } from "react";
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

const LETTER_STAGGER_MS = 28;
const LIFT_OFF_MS = 60;
const FLIGHT_BASE_MS = 420;
const FLIGHT_MS_PER_TRAVEL_PX = 0.6;
const FLIGHT_MAX_MS = 620;
const SETTLE_MS = 260;
const FALL_MS = 340;
const FALL_STAGGER_MS = 16;
const SPARK_MS = 560;
const CHIP_RECOIL_MS = 320;

const HOP_BASE_PX = 12;
const HOP_PER_TRAVEL_PX = 0.1;
const HOP_MAX_PX = 36;

const EASE_OUT_QUAD = "cubic-bezier(0.25, 0.46, 0.45, 0.94)";
const EASE_OUT_CUBIC = "cubic-bezier(0.215, 0.61, 0.355, 1)";
const EASE_IN_QUAD = "cubic-bezier(0.55, 0.085, 0.68, 0.53)";
const EASE_IN_OUT_QUAD = "cubic-bezier(0.455, 0.03, 0.515, 0.955)";

const STAR_CLIP_PATH =
  "polygon(50% 0%, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0% 50%, 38% 38%)";

interface Spark {
  angleDeg: number;
  distancePx: number;
  sizePx: number;
  isStar: boolean;
}

// Fanned out from the end of the text, away from the letters.
const SPARKS: Spark[] = [
  { angleDeg: -90, distancePx: 20, sizePx: 5, isStar: false },
  { angleDeg: -50, distancePx: 26, sizePx: 10, isStar: true },
  { angleDeg: -15, distancePx: 21, sizePx: 5, isStar: false },
  { angleDeg: 20, distancePx: 27, sizePx: 9, isStar: true },
  { angleDeg: 55, distancePx: 21, sizePx: 5, isStar: false },
  { angleDeg: 90, distancePx: 19, sizePx: 8, isStar: true },
];

interface FlyingLetter {
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

interface FallingLetter {
  char: string;
  left: number;
  width: number;
}

export interface PronounFlight {
  id: number;
  chip: HTMLElement;
  input: HTMLInputElement;
  font: CSSProperties;
  // Viewport box of the input's text line.
  lineTop: number;
  lineHeight: number;
  textEnd: number;
  chipFontScale: number;
  incoming: FlyingLetter[];
  outgoing: FallingLetter[];
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
    chip,
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
    textEnd: textLeft + context.measureText(label).width,
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

interface FlyingLetterGlyphProps {
  flight: PronounFlight;
  letter: FlyingLetter;
  index: number;
}

function FlyingLetterGlyph({ flight, letter, index }: FlyingLetterGlyphProps) {
  const slotRef = useRef<HTMLSpanElement>(null);
  const arcRef = useRef<HTMLSpanElement>(null);
  const glyphRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const slot = slotRef.current;
    const arc = arcRef.current;
    const glyph = glyphRef.current;
    if (!slot || !arc || !glyph) {
      return;
    }

    const { fromX, fromY, hopPx, delayMs, flightMs } = letter;
    const flightColor = window.getComputedStyle(glyph).color;
    const textColor = window.getComputedStyle(flight.input).color;

    // Under constant gravity, the time spent climbing to the apex and falling from it grows with
    // the square root of each height, which keeps the arc parabolic whatever the chip position.
    const apexY = Math.min(fromY, 0) - hopPx;
    const climb = Math.sqrt(fromY - apexY);
    const drop = Math.sqrt(-apexY);
    const apexOffset = climb / (climb + drop);
    const tiltDeg = (index % 2 === 0 ? -1 : 1) * (6 + (index % 3) * 3);
    const landingOffset = flightMs / (flightMs + SETTLE_MS);

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
            transform: `translateY(${fromY}px) rotate(0deg) scale(${flight.chipFontScale})`,
            easing: EASE_OUT_QUAD,
          },
          {
            offset: apexOffset,
            transform: `translateY(${apexY}px) rotate(${tiltDeg}deg) scale(1.1)`,
            easing: EASE_IN_QUAD,
          },
          { transform: "translateY(0px) rotate(0deg) scale(1)" },
        ],
        flightTiming
      ),
      // Stretches while falling, squashes on impact, then springs back while turning into the
      // input's text color.
      glyph.animate(
        [
          { offset: 0, transform: "scale(1, 1)", color: flightColor },
          { offset: landingOffset * 0.85, transform: "scale(0.9, 1.15)" },
          {
            offset: landingOffset,
            transform: "scale(1.3, 0.7)",
            color: flightColor,
            easing: EASE_OUT_CUBIC,
          },
          {
            offset: landingOffset + (1 - landingOffset) * 0.45,
            transform: "scale(0.95, 1.06)",
            easing: EASE_OUT_CUBIC,
          },
          { offset: 1, transform: "scale(1, 1)", color: textColor },
        ],
        { duration: flightMs + SETTLE_MS, delay: delayMs, fill: "both" }
      ),
    ];

    return () => animations.forEach((animation) => animation.cancel());
  }, [flight, letter, index]);

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
        <span
          ref={glyphRef}
          className="inline-block"
          style={{ transformOrigin: "50% 80%" }}
        >
          {letter.char}
        </span>
      </span>
    </span>
  );
}

interface FallingLetterGlyphProps {
  flight: PronounFlight;
  letter: FallingLetter;
  index: number;
}

function FallingLetterGlyph({
  flight,
  letter,
  index,
}: FallingLetterGlyphProps) {
  const glyphRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const glyph = glyphRef.current;
    if (!glyph) {
      return;
    }

    const color = window.getComputedStyle(flight.input).color;
    const direction = index % 2 === 0 ? -1 : 1;
    const driftPx = direction * (4 + (index % 3) * 3);
    const spinDeg = direction * (20 + (index % 4) * 8);

    // Knocked up a little, then dropped out of the field.
    const animation = glyph.animate(
      [
        {
          transform: "translate(0px, 0px) rotate(0deg)",
          opacity: 1,
          color,
          easing: EASE_OUT_QUAD,
        },
        {
          offset: 0.2,
          transform: `translate(${driftPx * 0.3}px, -5px) rotate(${spinDeg * 0.3}deg)`,
          opacity: 1,
          easing: EASE_IN_QUAD,
        },
        {
          transform: `translate(${driftPx}px, 22px) rotate(${spinDeg}deg)`,
          opacity: 0,
          color,
        },
      ],
      { duration: FALL_MS, delay: index * FALL_STAGGER_MS, fill: "both" }
    );

    return () => animation.cancel();
  }, [flight, index]);

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

interface SparkGlyphProps {
  flight: PronounFlight;
  spark: Spark;
}

function SparkGlyph({ flight, spark }: SparkGlyphProps) {
  const sparkRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const element = sparkRef.current;
    if (!element) {
      return;
    }

    const radians = (spark.angleDeg * Math.PI) / 180;
    const x = Math.cos(radians) * spark.distancePx;
    const y = Math.sin(radians) * spark.distancePx;

    const animation = element.animate(
      [
        {
          offset: 0,
          transform: "translate(0px, 0px) scale(0.3) rotate(0deg)",
          opacity: 0,
          easing: EASE_OUT_CUBIC,
        },
        {
          offset: 0.3,
          transform: `translate(${x * 0.6}px, ${y * 0.6}px) scale(1) rotate(45deg)`,
          opacity: 1,
          easing: EASE_OUT_QUAD,
        },
        {
          offset: 1,
          transform: `translate(${x}px, ${y}px) scale(0.2) rotate(90deg)`,
          opacity: 0,
        },
      ],
      { duration: SPARK_MS, delay: flight.landedAtMs, fill: "both" }
    );

    return () => animation.cancel();
  }, [flight, spark]);

  return (
    <span
      ref={sparkRef}
      className={cn(
        "absolute",
        spark.isStar ? "bg-highlight-500" : "rounded-full bg-highlight-400"
      )}
      style={{
        left: flight.textEnd + 4 - spark.sizePx / 2,
        top: flight.lineTop + flight.lineHeight / 2 - spark.sizePx / 2,
        width: spark.sizePx,
        height: spark.sizePx,
        clipPath: spark.isStar ? STAR_CLIP_PATH : undefined,
      }}
    />
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
  const { chip, input, landedAtMs } = flight;

  useLayoutEffect(() => {
    chip.animate(
      [
        { transform: "scale(1)", easing: EASE_OUT_QUAD },
        { offset: 0.3, transform: "scale(0.9)", easing: EASE_OUT_CUBIC },
        { transform: "scale(1)" },
      ],
      CHIP_RECOIL_MS
    );
    // The letters stand in for the real text until the overlay unmounts.
    const hideText = input.animate(
      { color: "transparent" },
      { fill: "forwards" }
    );
    const doneTimeout = window.setTimeout(onDone, landedAtMs + SPARK_MS);
    // Typing mid-flight hands the field back right away.
    input.addEventListener("input", onDone);

    return () => {
      hideText.cancel();
      window.clearTimeout(doneTimeout);
      input.removeEventListener("input", onDone);
    };
  }, [chip, input, landedAtMs, onDone]);

  return createPortal(
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 text-highlight-500"
      style={flight.font}
    >
      {flight.outgoing.map((letter, index) => (
        <FallingLetterGlyph
          key={index}
          flight={flight}
          letter={letter}
          index={index}
        />
      ))}
      {flight.incoming.map((letter, index) => (
        <FlyingLetterGlyph
          key={index}
          flight={flight}
          letter={letter}
          index={index}
        />
      ))}
      {SPARKS.map((spark, index) => (
        <SparkGlyph key={index} flight={flight} spark={spark} />
      ))}
    </div>,
    document.body
  );
}
