import { ContentMessage, Spinner } from "@dust-tt/sparkle";
import React, { useEffect, useRef, useState } from "react";

import { classNames } from "@app/lib/utils";
import { debounce } from "@app/lib/utils/debounce";
import type {
  APIError,
  BuilderSuggestionsType,
  Result,
  WorkspaceType,
} from "@app/types";
import { Err, md5, Ok } from "@app/types";

const STATIC_SUGGESTIONS = [
  "Break down your instructions into steps to leverage the model's reasoning capabilities.",
  "Give context on how you'd like the agent to act, e.g. 'Act like a senior analyst'.",
  "Add instructions on the format of the answer: tone of voice, answer in bullet points, in code blocks, etc...",
  "Try to be specific: tailor prompts with precise language to avoid ambiguity.",
];

type SuggestionStatus =
  | "no_suggestions"
  | "loading"
  | "suggestions_available"
  | "instructions_are_good"
  | "error";

export function InstructionSuggestions({
  owner,
  instructions,
}: {
  owner: WorkspaceType;
  instructions: string;
}) {
  // history of all suggestions. The first two are displayed.
  const [suggestions, setSuggestions] = useState<string[]>(
    !instructions ? STATIC_SUGGESTIONS : []
  );
  const [suggestionsStatus, setSuggestionsStatus] = useState<SuggestionStatus>(
    !instructions ? "suggestions_available" : "no_suggestions"
  );

  const horinzontallyScrollableDiv = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<APIError | null>(null);

  const debounceHandle = useRef<NodeJS.Timeout | undefined>(undefined);

  // the ref allows comparing previous instructions to current instructions
  // in the effect below
  const previousInstructions = useRef<string | null>(instructions);

  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (suggestionsStatus !== "no_suggestions") {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [suggestionsStatus]);

  useEffect(() => {
    // update suggestions when (and only when) instructions change
    if (instructions === previousInstructions.current) {
      return;
    }
    previousInstructions.current = instructions;

    if (!instructions.trim()) {
      setError(null);
      setSuggestionsStatus(
        suggestions.length > 0 ? "suggestions_available" : "no_suggestions"
      );
      clearTimeout(debounceHandle.current);
      return;
    }

    const updateSuggestions = async () => {
      setSuggestionsStatus("loading");
      // suggestions that are shown by default when no instructions are typed,
      // are not considered as former suggestions. This way, the model will
      // always generate tailored suggestions on the first input, which is preferable:
      // - the user is more likely to be interested (since they likely saw the static suggestions before)
      // - the model is not biased by static suggestions to generate new ones.
      const formerSuggestions =
        suggestions === STATIC_SUGGESTIONS ? [] : suggestions.slice(0, 2);
      const updatedSuggestions = await getRankedSuggestions({
        owner,
        currentInstructions: instructions,
        formerSuggestions,
      });
      if (updatedSuggestions.isErr()) {
        setError(updatedSuggestions.error);
        setSuggestionsStatus("error");
        return;
      }
      if (
        updatedSuggestions.value.status === "ok" &&
        !updatedSuggestions.value.suggestions?.length
      ) {
        setSuggestionsStatus("instructions_are_good");
        return;
      }
      const newSuggestions = mergeSuggestions(
        suggestions,
        updatedSuggestions.value
      );
      if (newSuggestions.length > suggestions.length) {
        // only update suggestions if they have changed, & reset scroll
        setSuggestions(newSuggestions);
        horinzontallyScrollableDiv.current?.scrollTo(0, 0);
      }
      setError(null);
      setSuggestionsStatus("suggestions_available");
    };

    debounce(debounceHandle, updateSuggestions);
    return () => {
      if (debounceHandle.current) {
        clearTimeout(debounceHandle.current);
        debounceHandle.current = undefined;
      }
    };
  }, [instructions, owner, suggestions]);

  const [showLeftGradients, setshowLeftGradients] = useState(false);
  const [showRightGradients, setshowRightGradients] = useState(false);

  const showCorrectGradients = () => {
    const scrollableDiv = horinzontallyScrollableDiv.current;
    if (!scrollableDiv) {
      return;
    }
    const scrollLeft = scrollableDiv.scrollLeft;
    const isScrollable = scrollableDiv.scrollWidth > scrollableDiv.clientWidth;

    setshowLeftGradients(scrollLeft > 0);
    setshowRightGradients(
      isScrollable &&
        scrollLeft < scrollableDiv.scrollWidth - scrollableDiv.clientWidth
    );
  };

  return (
    <div
      className={classNames(
        "transition-all duration-1000 ease-in-out",
        isVisible ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
      )}
    >
      <div className="relative flex flex-col">
        <div
          className={classNames(
            "heading-base flex items-center gap-2",
            "text-muted-foreground dark:text-muted-foreground-night"
          )}
        >
          <div>Tips</div>
          {suggestionsStatus === "loading" && <Spinner size="xs" />}
        </div>
        <div
          className="overflow-y-auto pt-2 scrollbar-hide"
          ref={horinzontallyScrollableDiv}
          onScroll={showCorrectGradients}
        >
          <div
            className={classNames(
              "absolute bottom-0 left-0 top-8 w-8 border-l bg-gradient-to-l transition-opacity duration-700 ease-out",
              "border-primary-200/80 dark:border-primary-200-night/80",
              "from-white/0 to-white/70 dark:from-black/0 dark:to-black/70",
              showLeftGradients ? "opacity-100" : "opacity-0"
            )}
          />
          <div
            className={classNames(
              "absolute bottom-0 right-0 top-8 w-8 border-r bg-gradient-to-r transition-opacity duration-700 ease-out",
              "border-primary-200/80 dark:border-primary-200-night/80",
              "from-white/0 to-white/70 dark:from-black/0 dark:to-black/70",
              showRightGradients ? "opacity-100" : "opacity-0"
            )}
          />
          {(() => {
            if (error) {
              return (
                <AnimatedSuggestion
                  variant="warning"
                  suggestion={`Error loading new suggestions:\n${error.message}`}
                />
              );
            }
            if (suggestionsStatus === "instructions_are_good") {
              return (
                <AnimatedSuggestion
                  variant="primary"
                  suggestion="Looking good! 🎉"
                />
              );
            }
            return (
              <div className="flex w-max gap-2">
                {suggestions.map((suggestion) => (
                  <AnimatedSuggestion
                    suggestion={suggestion}
                    key={md5(suggestion)}
                    afterEnter={showCorrectGradients}
                  />
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function AnimatedSuggestion({
  suggestion,
  variant = "highlight",
  afterEnter,
}: {
  suggestion: string;
  variant?: React.ComponentProps<typeof ContentMessage>["variant"];
  afterEnter?: () => void;
}) {
  return (
    <div
      className="w-80 animate-[appear_0.3s_ease-out]"
      onAnimationEnd={afterEnter}
    >
      <ContentMessage
        size="sm"
        title=""
        variant={variant}
        className="h-full w-80"
      >
        {suggestion}
      </ContentMessage>
    </div>
  );
}

/*  Returns suggestions as per the dust app:
 * - empty array if the instructions are good;
 * - otherwise, 2 former suggestions + 2 new suggestions, ranked by order of relevance.
 */
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

const VISIBLE_SUGGESTIONS_NUMBER = 2;
/**
 *
 * @param suggestions existing suggestions
 * @param dustAppSuggestions suggestions returned by the dust app via getRankedSuggestions
 * @returns suggestions updated with the new ones that ranked better than the visible ones if any
 */
function mergeSuggestions(
  suggestions: string[],
  dustAppSuggestions: BuilderSuggestionsType
): string[] {
  if (dustAppSuggestions.status === "ok") {
    const visibleSuggestions = suggestions.slice(0, VISIBLE_SUGGESTIONS_NUMBER);
    const bestRankedSuggestions = (dustAppSuggestions.suggestions ?? []).slice(
      0,
      VISIBLE_SUGGESTIONS_NUMBER
    );

    // Reorder existing suggestions with best ranked first
    const mergedSuggestions = [
      ...suggestions.filter((suggestion) =>
        bestRankedSuggestions.includes(suggestion)
      ),
      ...suggestions.filter(
        (suggestion) => !bestRankedSuggestions.includes(suggestion)
      ),
    ];
    // insert new good ones
    for (const suggestion of bestRankedSuggestions) {
      if (!visibleSuggestions.includes(suggestion)) {
        mergedSuggestions.unshift(suggestion);
      }
    }
    return mergedSuggestions;
  }
  return suggestions;
}
