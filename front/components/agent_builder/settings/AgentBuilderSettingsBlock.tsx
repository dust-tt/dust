import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  PencilSquareIcon,
  SparklesIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useRef, useState } from "react";
import { useController, useWatch } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderSectionContainer } from "@app/components/agent_builder/AgentBuilderSectionContainer";
import { AccessSection } from "@app/components/agent_builder/settings/AccessSection";
import { AvatarPicker } from "@app/components/agent_builder/settings/avatar_picker/AgentBuilderAvatarPicker";
import {
  DROID_AVATAR_URLS,
  SPIRIT_AVATAR_URLS,
} from "@app/components/agent_builder/settings/avatar_picker/types";
import {
  buildSelectedEmojiType,
  makeUrlForEmojiAndBackground,
} from "@app/components/agent_builder/settings/avatar_picker/utils";
import { TagsSection } from "@app/components/agent_builder/settings/TagsSection";
import {
  fetchWithErr,
  getDescriptionSuggestion,
  getNameSuggestions,
} from "@app/components/agent_builder/settings/utils";
import { SettingSectionContainer } from "@app/components/agent_builder/shared/SettingSectionContainer";
import { useSendNotification } from "@app/hooks/useNotification";
import type {
  APIError,
  BuilderEmojiSuggestionsType,
  Result,
  WorkspaceType,
} from "@app/types";

const MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS = 20;

async function getEmojiSuggestions({
  owner,
  instructions,
}: {
  owner: WorkspaceType;
  instructions: string;
}): Promise<Result<BuilderEmojiSuggestionsType, APIError>> {
  return fetchWithErr(`/api/w/${owner.sId}/assistant/builder/suggestions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "emoji",
      inputs: { instructions },
    }),
  });
}

function AgentNameInput() {
  const { owner } = useAgentBuilderContext();
  const instructions = useWatch<AgentBuilderFormData, "instructions">({
    name: "instructions",
  });
  const description = useWatch<
    AgentBuilderFormData,
    "agentSettings.description"
  >({
    name: "agentSettings.description",
  });
  const sendNotification = useSendNotification();

  const [isGenerating, setIsGenerating] = useState(false);
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);

  const { field, fieldState } = useController<
    AgentBuilderFormData,
    "agentSettings.name"
  >({
    name: "agentSettings.name",
  });

  const handleGenerateNameSuggestions = async () => {
    if (
      isGenerating ||
      !instructions ||
      instructions.length < MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS
    ) {
      return;
    }

    setIsGenerating(true);
    setNameSuggestions([]);

    const result = await getNameSuggestions({
      owner,
      instructions,
      description,
    });

    if (result.isErr()) {
      console.error("Failed to generate name suggestions:", result.error);
      sendNotification({
        type: "error",
        title: "Failed to generate name suggestions",
        description: result.error.message,
      });
      setIsGenerating(false);
      return;
    }

    if (result.value.status === "ok" && result.value.suggestions) {
      setNameSuggestions(result.value.suggestions);
      if (result.value.suggestions.length === 0) {
        sendNotification({
          type: "info",
          title: "No suggestions available",
          description:
            "Try adding more details to your instructions to get better suggestions.",
        });
      }
    }
    setIsGenerating(false);
  };

  const handleSelectNameSuggestion = (suggestion: string) => {
    field.onChange(suggestion);
  };

  return (
    <SettingSectionContainer title="Name">
      <div className="relative">
        <Input placeholder="Enter agent name" {...field} className="pr-10" />
        <DropdownMenu
          onOpenChange={(open) => open && handleGenerateNameSuggestions()}
        >
          <DropdownMenuTrigger asChild>
            <Button
              icon={SparklesIcon}
              variant="outline"
              size="xs"
              className="absolute right-0 top-1/2 mr-1 h-7 w-7 -translate-y-1/2 rounded-lg p-0"
              disabled={
                !instructions ||
                instructions.length < MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS
              }
              tooltip={
                !instructions ||
                instructions.length < MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS
                  ? `Add at least ${MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS} characters to instructions to get suggestions`
                  : "Get name suggestions"
              }
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64">
            {isGenerating ? (
              <div className="flex items-center justify-center p-4">
                <Spinner size="sm" />
              </div>
            ) : nameSuggestions.length > 0 ? (
              nameSuggestions.map((suggestion, index) => (
                <DropdownMenuItem
                  key={`naming-suggestion-${index}`}
                  label={suggestion}
                  onClick={() => handleSelectNameSuggestion(suggestion)}
                />
              ))
            ) : (
              <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
                No suggestions available
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {fieldState.error && (
        <p className="text-sm text-warning-500">{fieldState.error.message}</p>
      )}
    </SettingSectionContainer>
  );
}

function AgentDescriptionInput() {
  const { owner } = useAgentBuilderContext();
  const instructions = useWatch<AgentBuilderFormData, "instructions">({
    name: "instructions",
  });
  const name = useWatch<AgentBuilderFormData, "agentSettings.name">({
    name: "agentSettings.name",
  });
  const sendNotification = useSendNotification();

  const [isGenerating, setIsGenerating] = useState(false);
  const hasSuggestedRef = useRef(false);

  const { field, fieldState } = useController<
    AgentBuilderFormData,
    "agentSettings.description"
  >({ name: "agentSettings.description" });

  const handleGenerateDescription = useCallback(async () => {
    if (
      isGenerating ||
      !instructions ||
      instructions.length < MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS
    ) {
      return;
    }

    setIsGenerating(true);

    const result = await getDescriptionSuggestion({
      owner,
      instructions,
      name: name || "Assistant",
    });

    if (result.isErr()) {
      console.error("Failed to generate description:", result.error);
      sendNotification({
        type: "error",
        title: "Failed to generate description",
        description: result.error.message,
      });
      setIsGenerating(false);
      return;
    }

    if (
      result.value.status === "ok" &&
      result.value.suggestions &&
      result.value.suggestions.length > 0
    ) {
      // Apply the first suggestion directly
      field.onChange(result.value.suggestions[0]);
    } else {
      sendNotification({
        type: "info",
        title: "No description suggestions available",
        description:
          "Try adding more details to your instructions to get better suggestions.",
      });
    }
    setIsGenerating(false);
  }, [isGenerating, instructions, owner, name, field, sendNotification]);

  useEffect(() => {
    if (
      !field.value &&
      !hasSuggestedRef.current &&
      instructions &&
      instructions.length >= MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS
    ) {
      hasSuggestedRef.current = true;
      void handleGenerateDescription();
    }

    // Reset the flag if instructions become too short again
    if (
      instructions &&
      instructions.length < MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS
    ) {
      hasSuggestedRef.current = false;
    }
  }, [field.value, instructions, handleGenerateDescription]);

  return (
    <SettingSectionContainer title="Description">
      <div className="relative">
        <Input placeholder="Enter agent description" {...field} />
        <Button
          icon={isGenerating ? () => <Spinner size="xs" /> : SparklesIcon}
          variant="outline"
          size="xs"
          className="absolute right-0 top-1/2 mr-1 h-7 w-7 -translate-y-1/2 rounded-lg p-0"
          disabled={
            isGenerating ||
            !instructions ||
            instructions.length < MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS
          }
          onClick={handleGenerateDescription}
          tooltip={
            isGenerating
              ? "Generating description..."
              : !instructions ||
                  instructions.length < MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS
                ? `Add at least ${MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS} characters to the instructions to get suggestions`
                : "Generate description"
          }
        />
      </div>
      {fieldState.error && (
        <p className="text-sm text-warning-500">{fieldState.error.message}</p>
      )}
    </SettingSectionContainer>
  );
}

function AgentPictureInput() {
  const { owner } = useAgentBuilderContext();
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const hasSuggestedRef = useRef(false);
  const instructions = useWatch<AgentBuilderFormData, "instructions">({
    name: "instructions",
  });

  const { field } = useController<
    AgentBuilderFormData,
    "agentSettings.pictureUrl"
  >({
    name: "agentSettings.pictureUrl",
  });

  const updateEmojiFromSuggestions = useCallback(async () => {
    let avatarUrl: string | null = null;
    const emojiSuggestions = await getEmojiSuggestions({
      owner,
      instructions: instructions || "",
    });
    if (emojiSuggestions.isOk() && emojiSuggestions.value.suggestions.length) {
      const suggestion = emojiSuggestions.value.suggestions[0];
      const emoji = buildSelectedEmojiType(suggestion.emoji);
      if (emoji) {
        avatarUrl = makeUrlForEmojiAndBackground(
          {
            id: emoji.id,
            unified: emoji.unified,
            native: emoji.native,
          },
          suggestion.backgroundColor as `bg-${string}`
        );
      }
    }
    // Default on Ed's babies if no emoji is found
    if (!avatarUrl) {
      const availableUrls = [...DROID_AVATAR_URLS, ...SPIRIT_AVATAR_URLS];
      avatarUrl =
        availableUrls[Math.floor(Math.random() * availableUrls.length)];
    }

    field.onChange(avatarUrl);
  }, [owner, instructions, field]);

  useEffect(() => {
    if (
      !field.value &&
      !hasSuggestedRef.current &&
      instructions &&
      instructions.length >= MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS
    ) {
      hasSuggestedRef.current = true;
      void updateEmojiFromSuggestions();
    }

    // Reset the flag if instructions become too short again
    if (
      instructions &&
      instructions.length < MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS
    ) {
      hasSuggestedRef.current = false;
    }
  }, [field.value, instructions, updateEmojiFromSuggestions]);

  return (
    <>
      <AvatarPicker
        owner={owner}
        isOpen={isAvatarModalOpen}
        setOpen={setIsAvatarModalOpen}
        onPick={field.onChange}
        droidAvatarUrls={DROID_AVATAR_URLS}
        spiritAvatarUrls={SPIRIT_AVATAR_URLS}
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        avatarUrl={field.value || null}
      />
      <div className="group relative">
        {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing */}
        <Avatar size="lg" visual={field.value || null} />
        <Button
          variant="outline"
          size="sm"
          icon={PencilSquareIcon}
          type="button"
          onClick={() => setIsAvatarModalOpen(true)}
          className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>
    </>
  );
}

export function AgentBuilderSettingsBlock() {
  return (
    <AgentBuilderSectionContainer title="Settings">
      <div className="space-y-5">
        <div className="flex items-start gap-8">
          <div className="flex-grow">
            <AgentNameInput />
          </div>
          <AgentPictureInput />
        </div>
        <AgentDescriptionInput />
        <AccessSection />
        <TagsSection />
      </div>
    </AgentBuilderSectionContainer>
  );
}
