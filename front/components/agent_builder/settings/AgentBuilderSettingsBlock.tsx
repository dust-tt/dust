import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Page,
  SparklesIcon,
  TextArea,
  useSendNotification,
} from "@dust-tt/sparkle";
import React, { useState } from "react";
import { useController, useWatch } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import {
  getDescriptionSuggestion,
  getNameSuggestions,
} from "@app/components/agent_builder/settings/utils";

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
    <div className="space-y-2">
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
              <AgentNameInput />
              <AgentDescriptionInput />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
