import { useEffect, useState } from "react";

const WORDS = ["RevOps", "Support", "GTM Ops", "Marketing"];
const TYPING_SPEED_MS = 60;
const DELETING_SPEED_MS = 40;
const PAUSE_AFTER_TYPE_MS = 1500;
const PAUSE_AFTER_DELETE_MS = 300;

type Phase = "typing" | "pausing" | "deleting";

export function RotatingWord() {
  const [wordIndex, setWordIndex] = useState(0);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("typing");

  useEffect(() => {
    const currentWord = WORDS[wordIndex];

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
    <span className="whitespace-nowrap text-blue-600">
      {text}
      <span aria-hidden="true" className="animate-pulse">
        |
      </span>
    </span>
  );
}
