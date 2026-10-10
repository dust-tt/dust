import type { PronounFill } from "@app/components/me/PronounFillAnimation";
import {
  createPronounFill,
  PronounFillAnimation,
} from "@app/components/me/PronounFillAnimation";
import { Chip } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useReducedMotion } from "framer-motion";
import type { RefObject } from "react";
import { useCallback, useState } from "react";

// Shown in the viewer's locale; the translated text is what gets stored when a preset is picked.
const PRONOUN_PRESETS: MessageDescriptor[] = [
  msg({ message: "She/Her", context: "pronouns" }),
  msg({ message: "He/Him", context: "pronouns" }),
  msg({ message: "They/Them", context: "pronouns" }),
];

function isPresetSelected(value: string, label: string): boolean {
  return value.trim().toLowerCase() === label.toLowerCase();
}

interface PronounPresetChipsProps {
  value: string;
  onSelect: (pronouns: string) => void;
  // The input showing `value`, which picked presets animate into.
  inputRef: RefObject<HTMLInputElement>;
}

/**
 * @cc [owner:aubin-tchoi,label:react] no-fill-animation-with-reduced-motion
 * Picking a preset MUST NOT play the fill animation when the user prefers reduced motion.
 */
export function PronounPresetChips({
  value,
  onSelect,
  inputRef,
}: PronounPresetChipsProps) {
  const { t } = useLingui();
  const shouldReduceMotion = useReducedMotion();
  const [fill, setFill] = useState<PronounFill | null>(null);
  const endFill = useCallback(() => setFill(null), []);

  const selectPreset = (label: string) => {
    const input = inputRef.current;
    if (input && !shouldReduceMotion && !isPresetSelected(value, label)) {
      setFill(createPronounFill(input, label));
    }
    onSelect(label);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {PRONOUN_PRESETS.map((preset) => {
        const label = t(preset);
        return (
          <Chip
            key={label}
            label={label}
            size="xs"
            color={isPresetSelected(value, label) ? "highlight" : "primary"}
            onClick={() => selectPreset(label)}
          />
        );
      })}
      {fill && (
        <PronounFillAnimation key={fill.text} fill={fill} onDone={endFill} />
      )}
    </div>
  );
}
