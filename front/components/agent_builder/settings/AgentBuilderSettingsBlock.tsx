import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Page,
  SparklesIcon,
  TextArea,
} from "@dust-tt/sparkle";
import React, { useState } from "react";

import { useAgentBuilderSettingsContext } from "@app/components/agent_builder/settings/AgentSettingsContext";

export function AgentBuilderSettingsBlock() {
  const { name, setName, description, setDescription } =
    useAgentBuilderSettingsContext();
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState<
    "name" | "description" | null
  >(null);
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);

  const handleGenerateNameSuggestions = async () => {
    setIsGenerating("name");
    try {
      // TODO: Implement API call for name suggestions
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setNameSuggestions(["DataAnalyst", "ResearchBot", "ContentHelper"]);
    } catch (error) {
      console.error("Failed to generate name suggestions:", error);
    } finally {
      setIsGenerating(null);
    }
  };

  const handleGenerateDescription = async () => {
    setIsGenerating("description");
    try {
      // TODO: Implement API call for description generation
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setDescription(
        "An intelligent assistant that helps with data analysis and research tasks."
      );
    } catch (error) {
      console.error("Failed to generate description:", error);
    } finally {
      setIsGenerating(null);
    }
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
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground dark:text-foreground-night">
                    Name
                  </label>
                  <Button
                    label="Suggest"
                    size="xs"
                    icon={SparklesIcon}
                    variant="outline"
                    isLoading={isGenerating === "name"}
                    onClick={handleGenerateNameSuggestions}
                  />
                </div>
                <Input
                  placeholder="Enter agent name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
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
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground dark:text-foreground-night">
                    Description
                  </label>
                  <Button
                    label="Suggest"
                    size="xs"
                    icon={SparklesIcon}
                    variant="outline"
                    isLoading={isGenerating === "description"}
                    onClick={handleGenerateDescription}
                  />
                </div>
                <TextArea
                  placeholder="Enter agent description"
                  value={description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setDescription(e.target.value)
                  }
                  rows={3}
                  disabled={isGenerating === "description"}
                />
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
