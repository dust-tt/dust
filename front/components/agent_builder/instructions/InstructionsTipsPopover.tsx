import {
  ContentMessage,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import { LightbulbIcon } from "@dust-tt/sparkle";
import { Button } from "@dust-tt/sparkle";
import { useState } from "react";
import React from "react";

import type {
  APIError,
  BuilderSuggestionsType,
  Result,
  WorkspaceType,
} from "@app/types";
import { Err, Ok } from "@app/types";

const STATIC_TIPS = [
  "Break down your instructions into steps to leverage the model’s reasoning capabilities.",
  "Give context on how you’d like the agent to act, e.g. 'Act like a senior analyst'.",
  "Add instructions on the format of the answer: tone of voice, answer in bullet points, in code blocks, etc...",
];

type TipStatus = "loading" | "loaded" | "error";

interface InstructionTipsPopoverProps {
  owner: WorkspaceType;
  instructions: string;
}

export function InstructionTipsPopover({
  owner,
  instructions,
}: InstructionTipsPopoverProps) {
  const [tips, setTips] = useState<string[]>(STATIC_TIPS);
  const [status, setStatus] = useState<TipStatus>("loaded");
  const [error, setError] = useState<APIError | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const fetchTips = async () => {
    setStatus("loading");
    setError(null);

    const result = await getRankedSuggestions({
      owner,
      currentInstructions: instructions,
      formerSuggestions: [],
    });

    if (result.isErr()) {
      setError(result.error);
      setStatus("error");
      return;
    }

    if (result.value.status === "ok" && result.value.suggestions?.length) {
      // Take first 3 suggestions
      setTips(result.value.suggestions.slice(0, 3));
    } else {
      // Fallback to static tips
      setTips(STATIC_TIPS);
    }

    setStatus("loaded");
  };

  function onOpenChange(isOpen: boolean) {
    if (isOpen) {
      void fetchTips();
    }
    setIsOpen(isOpen);
  }

  return (
    <PopoverRoot open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          icon={LightbulbIcon}
          aria-label="View instruction tips"
        />
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" side="bottom" align="start">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="heading-base text-muted-foreground dark:text-muted-foreground-night">
              Tips
            </span>
            {status === "loading" && <Spinner size="xs" />}
          </div>

          <div className="flex flex-col gap-2">
            {status === "error" && error ? (
              <ContentMessage size="sm" variant="warning" className="w-full">
                Error loading tips: {error.message}
              </ContentMessage>
            ) : (
              tips.map((tip, index) => (
                <ContentMessage
                  key={index}
                  size="sm"
                  variant="highlight"
                  className="w-full"
                >
                  {tip}
                </ContentMessage>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}

async function getRankedSuggestions({
  owner,
  currentInstructions,
  formerSuggestions,
}: {
  owner: WorkspaceType;
  currentInstructions: string;
  formerSuggestions: string[];
}): Promise<Result<BuilderSuggestionsType, APIError>> {
  const res = await fetch(`/api/w/${owner.sId}/assistant/builder/suggestions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "instructions",
      inputs: {
        current_instructions: currentInstructions,
        former_suggestions: formerSuggestions,
      },
    }),
  });

  if (!res.ok) {
    return new Err({
      type: "internal_server_error",
      message: "Failed to get suggestions",
    });
  }

  return new Ok(await res.json());
}
