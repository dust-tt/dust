import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Page,
  SparklesIcon,
  useSendNotification,
} from "@dust-tt/sparkle";
import React, { useState } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { useAgentBuilderInstructionsContext } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsContext";
import { useAgentBuilderSettingsContext } from "@app/components/agent_builder/settings/AgentSettingsContext";
import {
  getDescriptionSuggestion,
  getNameSuggestions,
} from "@app/components/agent_builder/settings/utils";

export function AgentBuilderSettingsBlock() {
  const { name, setName, description, setDescription } =
    useAgentBuilderSettingsContext();
  const { owner } = useAgentBuilderContext();
  const { instructions } = useAgentBuilderInstructionsContext();
  const sendNotification = useSendNotification();
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState<
    "name" | "description" | null
  >(null);
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);

  const handleGenerateNameSuggestions = async () => {
    setIsGenerating("name");
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
      setIsGenerating(null);
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
    setIsGenerating(null);
  };

  const handleGenerateDescription = async () => {
    setIsGenerating("description");
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
      setIsGenerating(null);
      return;
    }

    if (
      result.value.status === "ok" &&
      result.value.suggestions &&
      result.value.suggestions.length > 0
    ) {
      setDescription(result.value.suggestions[0]);
    }
    setIsGenerating(null);
  };

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
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground dark:text-foreground-night">
                  Name
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-grow">
                    <Input
                      placeholder="Enter agent name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <Button
                    label="Suggest"
                    size="xs"
                    icon={SparklesIcon}
                    variant="outline"
                    isLoading={isGenerating === "name"}
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
                        onClick={() => setName(suggestion)}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground dark:text-foreground-night">
                  Description
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-grow">
                    <Input
                      placeholder="Enter agent description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                  <Button
                    label="Suggest"
                    size="xs"
                    icon={SparklesIcon}
                    variant="outline"
                    isLoading={isGenerating === "description"}
                    onClick={handleGenerateDescription}
                  />
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
