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
  EyeIcon,
  EyeSlashIcon,
  Input,
  Page,
  PencilSquareIcon,
  PlusIcon,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SlackLogo,
  SparklesIcon,
  TextArea,
  UserIcon,
  useSendNotification,
} from "@dust-tt/sparkle";
import type { PaginationState } from "@tanstack/react-table";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useController, useWatch } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderEditors } from "@app/components/agent_builder/settings/AgentBuilderEditors";
import { AgentBuilderScopeSelector } from "@app/components/agent_builder/settings/AgentBuilderScopeSelector";
import { AgentBuilderSlackSelector } from "@app/components/agent_builder/settings/AgentBuilderSlackSelector";
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
import type { SlackChannel } from "@app/components/assistant_builder/SlackIntegration";
import { SlackAssistantDefaultManager } from "@app/components/assistant_builder/SlackIntegration";
import { AddEditorDropdown } from "@app/components/members/AddEditorsDropdown";
import { MembersList } from "@app/components/members/MembersList";
import { useSlackChannelsLinkedWithAgent } from "@app/lib/swr/assistants";
import { useUser } from "@app/lib/swr/user";
import type {
  APIError,
  BuilderEmojiSuggestionsType,
  Result,
  UserType,
  WorkspaceType,
} from "@app/types";
import { isBuilder } from "@app/types";

const MIN_INSTRUCTIONS_LENGTH_FOR_SUGGESTION = 30;

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
    setIsGenerating(true);
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
      <label className="text-sm font-medium text-foreground dark:text-foreground-night">
        Name
      </label>
      <div className="flex items-center gap-2">
        <div className="flex-grow">
          <Input placeholder="Enter agent name" {...field} />
        </div>
        <Button
          label="Suggest"
          size="xs"
          icon={SparklesIcon}
          variant="outline"
          isLoading={isGenerating}
          onClick={handleGenerateNameSuggestions}
        />
      </div>
      {nameSuggestions.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold text-muted-foreground dark:text-muted-foreground-night">
            Suggestions:
          </div>
          {nameSuggestions.slice(0, 3).map((suggestion, index) => (
            <Button
              label={suggestion}
              variant="outline"
              key={`naming-suggestion-${index}`}
              size="xs"
              onClick={() => handleSelectNameSuggestion(suggestion)}
            />
          ))}
        </div>
      )}
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
      field.onChange(result.value.suggestions[0]);
    }
    setIsGenerating(false);
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground dark:text-foreground-night">
        Description
      </label>
      <div className="flex items-center gap-2">
        <div className="flex-grow">
          <TextArea placeholder="Enter agent description" rows={3} {...field} />
        </div>
        <Button
          label="Suggest"
          size="xs"
          icon={SparklesIcon}
          variant="outline"
          isLoading={isGenerating}
          onClick={handleGenerateDescription}
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
      instructions.length >= MIN_INSTRUCTIONS_LENGTH_FOR_SUGGESTION
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
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground dark:text-foreground-night">
        Access and Publication
      </label>
      <div className="flex items-center gap-2">
        <AgentBuilderEditors />
        <AgentBuilderScopeSelector />
        <AgentBuilderSlackSelector />
      </div>
    </div>
  );
}

export function AgentBuilderSettingsBlock() {
  const [isOpen, setIsOpen] = useState(false);

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
              <div className="flex gap-8">
                <AgentAccessAndPublication />
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
