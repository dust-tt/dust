import type { AgentBuilderFormData } from "@app/components/agent_builder/agentBuilderFormSchema";
import { AgentBuilderSectionContainer } from "@app/components/agent_builder/AgentBuilderSectionContainer";
import { CharacterCountDisplay } from "@app/components/shared/CharacterCountDisplay";
import {
  MAX_AGENT_SUGGESTED_PROMPT_LENGTH,
  MAX_AGENT_SUGGESTED_PROMPTS,
} from "@app/types/api/assistant/configuration/suggested_prompts";
import { Button, Plus, TextArea, XClose } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";

function fitHeightToContent(element: HTMLTextAreaElement) {
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight + element.offsetHeight - element.clientHeight}px`;
}

export function AgentBuilderSuggestedPromptsBlock() {
  const { t } = useLingui();
  const { register } = useFormContext<AgentBuilderFormData>();
  const { fields, append, remove } = useFieldArray<
    AgentBuilderFormData,
    "suggestedPrompts"
  >({
    name: "suggestedPrompts",
  });
  const prompts = useWatch<AgentBuilderFormData, "suggestedPrompts">({
    name: "suggestedPrompts",
  });

  return (
    <AgentBuilderSectionContainer
      title={t`Suggested prompts`}
      description={t`Shown under the input bar when this agent is selected.`}
      headerActions={
        <Button
          icon={Plus}
          variant="outline"
          size="sm"
          label={t`Add prompt`}
          disabled={fields.length >= MAX_AGENT_SUGGESTED_PROMPTS}
          onClick={() => append({ prompt: "" })}
        />
      }
    >
      {fields.length > 0 && (
        <div className="flex flex-col gap-2">
          {fields.map((field, index) => {
            const { onChange, ref, ...promptField } = register(
              `suggestedPrompts.${index}.prompt`
            );

            return (
              <div key={field.id} className="flex items-start gap-2">
                <div className="flex flex-1 flex-col gap-1">
                  <TextArea
                    {...promptField}
                    ref={(element) => {
                      ref(element);
                      if (element) {
                        fitHeightToContent(element);
                      }
                    }}
                    minRows={1}
                    resize="none"
                    placeholder={t`What should people ask this agent?`}
                    maxLength={MAX_AGENT_SUGGESTED_PROMPT_LENGTH}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                      }
                    }}
                    onChange={(e) => {
                      e.target.value = e.target.value.replace(/\r?\n/g, " ");
                      fitHeightToContent(e.target);
                      return onChange(e);
                    }}
                  />
                  <CharacterCountDisplay
                    count={prompts[index]?.prompt.length ?? 0}
                    maxCount={MAX_AGENT_SUGGESTED_PROMPT_LENGTH}
                  />
                </div>
                <Button
                  icon={XClose}
                  variant="ghost"
                  size="sm"
                  tooltip={t`Remove prompt`}
                  onClick={() => remove(index)}
                />
              </div>
            );
          })}
        </div>
      )}
    </AgentBuilderSectionContainer>
  );
}
