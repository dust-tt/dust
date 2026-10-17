import { Button, Plus, XClose } from "@dust-tt/sparkle";

import { useState } from "react";

import { InlineText } from "./InlineText";
import { BuilderSection } from "./SectionContainer";

export const MAX_SUGGESTED_PROMPTS = 4;

/**
 * Up to four prompts the agent recommends to users when they pick it. One
 * empty row is always offered; each prompt is typed in place and a small
 * "Add prompt" button under the last row adds the next one.
 */
export function SuggestedPromptsSection({
  prompts,
  onChange,
}: {
  prompts: string[];
  onChange: (prompts: string[]) => void;
}) {
  const canAdd = prompts.length < MAX_SUGGESTED_PROMPTS;
  // The last prompt removed, restorable until the next change.
  const [lastRemoved, setLastRemoved] = useState<{
    index: number;
    value: string;
  } | null>(null);
  const hasContent = prompts.some((prompt) => prompt.trim().length > 0);

  const updatePrompt = (index: number, value: string) => {
    onChange(prompts.map((prompt, i) => (i === index ? value : prompt)));
  };
  const removePrompt = (index: number) => {
    if (prompts[index].trim()) {
      setLastRemoved({ index, value: prompts[index] });
    }
    const next = prompts.filter((_, i) => i !== index);
    onChange(next.length === 0 ? [""] : next);
  };

  return (
    <BuilderSection
      title="Suggested prompts"
      description={`Starter prompts people see when they pick your agent. Add up to ${MAX_SUGGESTED_PROMPTS}.`}
      collapsible
      defaultOpen={hasContent}
      summary={
        hasContent
          ? `${prompts.filter((prompt) => prompt.trim()).length} prompt${prompts.filter((prompt) => prompt.trim()).length === 1 ? "" : "s"}`
          : "None"
      }
    >
      <ol className="flex flex-col divide-y divide-border">
        {prompts.map((prompt, index) => (
          <li key={index} className="group flex items-start gap-3 py-1.5">
            <span className="w-3 pt-0.5 text-sm tabular-nums text-muted-foreground">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <InlineText
                value={prompt}
                placeholder="e.g. Draft release notes for last week’s merges"
                onChange={(value) => updatePrompt(index, value)}
                ariaLabel={`Suggested prompt ${index + 1}`}
                className="text-sm text-foreground"
                placeholderClassName="text-muted-foreground"
                singleLine={false}
              />
            </div>
            {prompts.length > 1 ? (
              <Button
                size="sm"
                variant="ghost"
                icon={XClose}
                tooltip="Remove prompt"
                className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 motion-reduce:transition-none"
                onClick={() => removePrompt(index)}
              />
            ) : null}
          </li>
        ))}
      </ol>
      <div className="-ml-2 flex items-center gap-2">
        {canAdd ? (
          <Button
            size="sm"
            variant="ghost"
            icon={Plus}
            label="Add prompt"
            onClick={() => {
              setLastRemoved(null);
              onChange([...prompts, ""]);
            }}
          />
        ) : (
          <span className="text-xs text-muted-foreground">
            All {MAX_SUGGESTED_PROMPTS} prompts added.
          </span>
        )}
        {lastRemoved ? (
          <Button
            size="sm"
            variant="ghost"
            label="Undo remove"
            onClick={() => {
              const next = [...prompts];
              if (next.length === 1 && !next[0].trim()) {
                next.splice(0, 1);
              }
              next.splice(
                Math.min(lastRemoved.index, next.length),
                0,
                lastRemoved.value
              );
              onChange(next.slice(0, MAX_SUGGESTED_PROMPTS));
              setLastRemoved(null);
            }}
          />
        ) : null}
      </div>
    </BuilderSection>
  );
}
