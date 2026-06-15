import type { InitialTasksSyncLookbackValue } from "@app/lib/project_task/analyze_document/types";
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
      <div className="flex flex-col gap-2">
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
 className="border-border hover:bg-muted-background/50 flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3"
          >
            <span className="flex items-center gap-2">
              <input
                type="radio"
                className="mt-0.5"
                name="initial-task-sync-lookback"
                checked={value === opt.value}
                onChange={() => {
                  setValue(opt.value);
                  onValueChange(opt.value);
                }}
              />
 <span className="text-sm font-medium text-foreground">
                {opt.title}
              </span>
            </span>
 <span className="pl-6 text-xs text-muted-foreground">
              {opt.description}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
