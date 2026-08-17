import { useEffect, useState } from "react";

const WORDS = ["RevOps", "Support", "GTM Ops", "Marketing"];
const TYPING_SPEED_MS = 60;
const DELETING_SPEED_MS = 40;
const PAUSE_AFTER_TYPE_MS = 1500;
const PAUSE_AFTER_DELETE_MS = 300;

// Reserve the widest word's footprint so the centered headline does not
// reflow on every keystroke.
const LONGEST_WORD = WORDS.reduce((a, b) => (b.length > a.length ? b : a));

type Phase = "typing" | "pausing" | "deleting";

export function RotatingWord() {
  const [wordIndex, setWordIndex] = useState(0);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("typing");

  useEffect(() => {
    const currentWord = WORDS[wordIndex];

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // No animation: show the current word fully typed.
      if (text !== currentWord) {
        setText(currentWord);
      }
      return;
    }

    if (phase === "typing") {
      if (text.length < currentWord.length) {
        const timeout = setTimeout(() => {
          setText(currentWord.slice(0, text.length + 1));
        }, TYPING_SPEED_MS);
        return () => clearTimeout(timeout);
      }
      const timeout = setTimeout(
        () => setPhase("pausing"),
        PAUSE_AFTER_TYPE_MS
      );
      return () => clearTimeout(timeout);
    }

    if (phase === "pausing") {
      const timeout = setTimeout(() => setPhase("deleting"), 0);
      return () => clearTimeout(timeout);
    }

    // phase === "deleting"
    if (text.length > 0) {
      const timeout = setTimeout(() => {
        setText(currentWord.slice(0, text.length - 1));
      }, DELETING_SPEED_MS);
      return () => clearTimeout(timeout);
    }
    const timeout = setTimeout(() => {
      setWordIndex((prev) => (prev + 1) % WORDS.length);
      setPhase("typing");
    }, PAUSE_AFTER_DELETE_MS);
    return () => clearTimeout(timeout);
  }, [text, phase, wordIndex]);

  return (
    <span className="relative inline-block whitespace-nowrap text-blue-600">
      <span className="invisible" aria-hidden="true">
        {LONGEST_WORD}|
      </span>
      <span className="absolute inset-y-0 left-0">
        {text}
        <span
          aria-hidden="true"
          className="motion-safe:animate-pulse motion-reduce:hidden"
        >
          |
        </span>
      </span>
    </span>
  );
}
