import { InputTypingAnimation } from "@app/components/shared/InputTypingAnimation";
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
  // The input showing `value`, into which picked presets are typed.
  inputRef: RefObject<HTMLInputElement>;
}

export function PronounPresetChips({
  value,
  onSelect,
  inputRef,
}: PronounPresetChipsProps) {
  const { t } = useLingui();
  const shouldReduceMotion = useReducedMotion();
  const [typing, setTyping] = useState<{
    input: HTMLInputElement;
    text: string;
  } | null>(null);
  const endTyping = useCallback(() => setTyping(null), []);

  const selectPreset = (label: string) => {
    const input = inputRef.current;
    if (input && !shouldReduceMotion && !isPresetSelected(value, label)) {
      setTyping({ input, text: label });
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
      {typing && (
        <InputTypingAnimation
          key={typing.text}
          input={typing.input}
          text={typing.text}
          onDone={endTyping}
        />
      )}
    </div>
  );
}
