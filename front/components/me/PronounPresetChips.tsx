import { Chip } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";

// Shown in the viewer's locale; the translated text is what gets stored when a preset is picked.
const PRONOUN_PRESETS: MessageDescriptor[] = [
  msg({ message: "She/Her", context: "pronouns" }),
  msg({ message: "He/Him", context: "pronouns" }),
  msg({ message: "They/Them", context: "pronouns" }),
];

interface PronounPresetChipsProps {
  value: string;
  onSelect: (pronouns: string) => void;
}

export function PronounPresetChips({
  value,
  onSelect,
}: PronounPresetChipsProps) {
  const { t } = useLingui();

  return (
    <div className="flex flex-wrap gap-2">
      {PRONOUN_PRESETS.map((preset) => {
        const label = t(preset);
        return (
          <Chip
            key={label}
            label={label}
            size="xs"
            color={
              value.trim().toLowerCase() === label.toLowerCase()
                ? "highlight"
                : "primary"
            }
            onClick={() => onSelect(label)}
          />
        );
      })}
    </div>
  );
}
