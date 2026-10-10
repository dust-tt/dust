import type { PronounFill } from "@app/components/me/PronounFillAnimation";
import {
  measurePronounFill,
  PronounFillAnimation,
} from "@app/components/me/PronounFillAnimation";
import { Chip } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useReducedMotion } from "framer-motion";
import type { RefObject } from "react";
import { useCallback, useRef, useState } from "react";

// Shown in the viewer's locale; the translated text is what gets stored when a preset is picked.
const PRONOUN_PRESETS: MessageDescriptor[] = [
  msg({ message: "She/Her", context: "pronouns" }),
  msg({ message: "He/Him", context: "pronouns" }),
  msg({ message: "They/Them", context: "pronouns" }),
];

function isPresetSelected(value: string, label: string): boolean {
  return value.trim().toLowerCase() === label.toLowerCase();
}

interface PronounPresetChipProps {
  label: string;
  isSelected: boolean;
  onSelect: (label: string, chip: HTMLDivElement | null) => void;
}

function PronounPresetChip({
  label,
  isSelected,
  onSelect,
}: PronounPresetChipProps) {
  const chipRef = useRef<HTMLDivElement>(null);

  return (
    <Chip
      ref={chipRef}
      label={label}
      size="xs"
      color={isSelected ? "highlight" : "primary"}
      onClick={() => onSelect(label, chipRef.current)}
    />
  );
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
  const fillCountRef = useRef(0);
  const [fill, setFill] = useState<PronounFill | null>(null);
  const endFill = useCallback(() => setFill(null), []);

  const selectPreset = (label: string, chip: HTMLDivElement | null) => {
    const input = inputRef.current;
    if (
      !shouldReduceMotion &&
      chip &&
      input &&
      !isPresetSelected(value, label)
    ) {
      fillCountRef.current += 1;
      setFill(
        measurePronounFill({ id: fillCountRef.current, chip, input, label })
      );
    }
    onSelect(label);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {PRONOUN_PRESETS.map((preset) => {
        const label = t(preset);
        return (
          <PronounPresetChip
            key={label}
            label={label}
            isSelected={isPresetSelected(value, label)}
            onSelect={selectPreset}
          />
        );
      })}
      {fill && (
        <PronounFillAnimation key={fill.id} fill={fill} onDone={endFill} />
      )}
    </div>
  );
}
