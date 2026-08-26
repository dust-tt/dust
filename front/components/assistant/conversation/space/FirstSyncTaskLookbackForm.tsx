import type { InitialTasksSyncLookbackValue } from "@app/lib/project_task/analyze_document/types";
import { Label, RadioGroup, RadioGroupCustomItem } from "@dust-tt/sparkle";
import { useState } from "react";

const OPTIONS: {
  value: InitialTasksSyncLookbackValue;
  title: string;
  description: string;
}[] = [
  {
    value: "now",
    title: "About now",
    description: "Roughly the last hour of activity.",
  },
  {
    value: "last_24h",
    title: "Last 24 hours",
    description: "Same default window as a typical catch-up run.",
  },
  {
    value: "max",
    title: "As far back as possible",
    description:
      "Search with no fixed lower time bound (subject to limits above).",
  },
];

export function FirstSyncTaskLookbackForm({
  onValueChange,
}: {
  onValueChange: (value: InitialTasksSyncLookbackValue) => void;
}) {
  const [value, setValue] = useState<InitialTasksSyncLookbackValue>("last_24h");

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-foreground">
        Choose how far back the first automatic scan should look for content to
        turn into suggested tasks.
      </p>
      <p className="text-xs text-muted-foreground">
        The first sync is not unlimited: connectors and search caps apply, so
        context is best-effort. Later runs cover everything new since the
        previous scan.
      </p>
      <RadioGroup
        value={value}
        onValueChange={(newValue) => {
          const opt = OPTIONS.find((o) => o.value === newValue);
          if (opt) {
            setValue(opt.value);
            onValueChange(opt.value);
          }
        }}
        className="flex flex-col gap-2"
      >
        {OPTIONS.map((opt) => (
          <div
            key={opt.value}
            className="border-border hover:bg-muted-background/50 flex flex-col gap-0.5 rounded-lg border p-3"
          >
            <RadioGroupCustomItem
              value={opt.value}
              id={opt.value}
              customItem={
                <Label
                  htmlFor={opt.value}
                  className="cursor-pointer text-sm font-medium text-foreground"
                >
                  {opt.title}
                </Label>
              }
            >
              <span className="pl-6 text-xs text-muted-foreground">
                {opt.description}
              </span>
            </RadioGroupCustomItem>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
