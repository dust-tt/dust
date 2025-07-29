import {
  Avatar,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Page,
  PencilSquareIcon,
  SparklesIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useState } from "react";
import { useController, useWatch } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderEditors } from "@app/components/agent_builder/settings/AgentBuilderEditors";
import { AgentBuilderScopeSelector } from "@app/components/agent_builder/settings/AgentBuilderScopeSelector";
import { AgentBuilderSlackSelector } from "@app/components/agent_builder/settings/AgentBuilderSlackSelector";
import { TagsSection } from "@app/components/agent_builder/settings/TagsSection";
import {
  fetchWithErr,
  getDescriptionSuggestion,
  getNameSuggestions,
} from "@app/components/agent_builder/settings/utils";
import { AvatarPicker } from "@app/components/assistant_builder/avatar_picker/AssistantBuilderAvatarPicker";
import {
  buildSelectedEmojiType,
  makeUrlForEmojiAndBackground,
} from "@app/components/assistant_builder/avatar_picker/utils";
import {
  DROID_AVATAR_URLS,
  SPIRIT_AVATAR_URLS,
} from "@app/components/assistant_builder/shared";
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
    <div className="max-w-md space-y-2">
      <label className="text-sm font-semibold text-foreground dark:text-foreground-night">
        Name
      </label>
      <div className="relative">
        <Input placeholder="Enter agent name" {...field} className="pr-10" />
        <DropdownMenu
          onOpenChange={(open) => open && handleGenerateNameSuggestions()}
        >
          <DropdownMenuTrigger asChild>
            <Button
              icon={SparklesIcon}
              variant={
                !instructions ||
                instructions.length < MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS
                  ? "ghost"
                  : "outline"
              }
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
          <DropdownMenuContent className="w-64" sideOffset={8}>
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
    </div>
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

  const { field, fieldState } = useController<
    AgentBuilderFormData,
    "agentSettings.description"
  >({ name: "agentSettings.description" });

  const handleGenerateDescription = async () => {
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
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-foreground dark:text-foreground-night">
        Description
      </label>
      <div className="relative">
        <Input
          placeholder="Enter agent description"
          {...field}
          className="pr-10"
        />
        <Button
          icon={isGenerating ? () => <Spinner size="xs" /> : SparklesIcon}
          variant={
            isGenerating ||
            !instructions ||
            instructions.length < MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS
              ? "ghost"
              : "outline"
          }
          size="xs"
          className={`absolute right-0 top-1/2 mr-1 h-7 w-7 -translate-y-1/2 rounded-lg p-0 ${
            isGenerating ? "bg-transparent" : ""
          }`}
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
    </div>
  );
}

function AgentPictureInput() {
  const { owner } = useAgentBuilderContext();
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
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
      instructions &&
      instructions.length >= MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS
    ) {
      void updateEmojiFromSuggestions();
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
        avatarUrl={field.value || null}
      />
      <div className="flex flex-col items-center space-y-2">
        <Avatar size="xl" visual={field.value || null} />
        <Button
          label="Change"
          variant="outline"
          size="xs"
          icon={PencilSquareIcon}
          type="button"
          onClick={() => setIsAvatarModalOpen(true)}
        />
      </div>
    </>
  );
}

function AgentAccessAndPublication() {
  return (
    <div className="flex h-full flex-col space-y-2">
      <label className="text-sm font-medium text-foreground dark:text-foreground-night">
        Access and Publication
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <AgentBuilderEditors />
        <AgentBuilderScopeSelector />
        <AgentBuilderSlackSelector />
      </div>
    </div>
  );
}

interface AgentBuilderSettingsBlockProps {
  isSettingBlocksOpen: boolean;
}

export function AgentBuilderSettingsBlock({
  isSettingBlocksOpen,
}: AgentBuilderSettingsBlockProps) {
  const [isOpen, setIsOpen] = useState(isSettingBlocksOpen);

  return (
    <div className="flex h-full flex-col gap-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger
          isOpen={isOpen}
          className="flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 hover:bg-transparent focus:outline-none"
        >
          <Page.H>Settings</Page.H>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-4 pt-4">
            <Page.P>
              <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                Configure the basic settings for your agent.
              </span>
            </Page.P>
            <div className="space-y-4">
              <div className="flex gap-8">
                <div className="flex flex-grow flex-col gap-4">
                  <AgentNameInput />
                  <AgentDescriptionInput />
                </div>
                <AgentPictureInput />
              </div>
              <div className="space-y-4">
                <TagsSection />
                <AgentAccessAndPublication />
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
