import {
  DEFAULT_REINFORCEMENT_CAP_MICRO_USD,
  DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_MICRO_USD,
} from "@app/lib/reinforcement/constants";
import {
  useReinforcementBatchModeToggle,
  useReinforcementCapSetting,
  useReinforcementToggle,
  useSelfImprovementCapPerSkillSetting,
} from "@app/lib/swr/useReinforcementToggle";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  CardIcon,
  ContextItem,
  Input,
  Page,
  SliderToggle,
  SparklesIcon,
  Square3Stack3DIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface ReinforcementSectionProps {
  owner: WorkspaceType;
}

export function ReinforcementSection({ owner }: ReinforcementSectionProps) {
  const { isEnabled, isChanging, doToggleReinforcement } =
    useReinforcementToggle({ owner });

  return (
    <Page.Vertical align="stretch" gap="md">
      <Page.SectionHeader title="Settings" />
      <ContextItem.List>
        <div className="h-full border-b border-border dark:border-border-night" />
        <ContextItem
          title="Allow self-improving skills"
          visual={<SparklesIcon className="h-6 w-6 shrink-0" />}
          hasSeparatorIfLast={true}
          action={
            <SliderToggle
              selected={isEnabled}
              disabled={isChanging}
              onClick={doToggleReinforcement}
            />
          }
        >
          <ContextItem.Description description="Allow Dust to analyze conversations to improve your workspace's skills. Dust does not use conversations to train models." />
        </ContextItem>
        <ReinforcementBatchModeToggle owner={owner} />
        <ReinforcementCapItem owner={owner} />
        <SelfImprovementCapPerSkillItem owner={owner} />
      </ContextItem.List>
    </Page.Vertical>
  );
}

function ReinforcementBatchModeToggle({ owner }: ReinforcementSectionProps) {
  const { isEnabled, isChanging, doToggleBatchMode } =
    useReinforcementBatchModeToggle({ owner });

  return (
    <ContextItem
      title="Enable batch processing"
      visual={<Square3Stack3DIcon className="h-6 w-6 shrink-0" />}
      hasSeparatorIfLast={true}
      action={
        <SliderToggle
          selected={isEnabled}
          disabled={isChanging}
          onClick={doToggleBatchMode}
        />
      }
    >
      <ContextItem.Description description="Conversations are sent in batches to reduce costs. Data may remain on LLM provider servers for up to several hours before processing. Disable to ensure immediate data deletion (ZDR-compatible). This will increase your plan's pricing." />
    </ContextItem>
  );
}

function SelfImprovementCapPerSkillItem({ owner }: ReinforcementSectionProps) {
  const { capDollars, isSaving, saveCapDollars } =
    useSelfImprovementCapPerSkillSetting({ owner });
  const [inputValue, setInputValue] = useState<string>(() =>
    String(capDollars)
  );

  const parsedInputDollars = Number(inputValue);
  const isInputDollarsValid =
    inputValue.trim() !== "" &&
    Number.isFinite(parsedInputDollars) &&
    parsedInputDollars >= 0;

  const defaultDollars =
    DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_MICRO_USD / 1_000_000;

  const handleSave = async () => {
    if (!isInputDollarsValid) {
      return;
    }
    await saveCapDollars(parsedInputDollars);
  };

  return (
    <ContextItem
      title="Default cost cap per skill"
      visual={<CardIcon className="h-6 w-6 shrink-0" />}
      hasSeparatorIfLast={true}
      action={
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <div className="w-32">
            <Input
              name="selfImprovementCapPerSkill"
              placeholder={String(defaultDollars)}
              value={inputValue}
              message={
                !isInputDollarsValid && inputValue !== ""
                  ? "Enter a non-negative number."
                  : undefined
              }
              messageStatus={
                !isInputDollarsValid && inputValue !== "" ? "error" : undefined
              }
              onChange={(event) => setInputValue(event.target.value)}
              disabled={isSaving}
            />
          </div>
          <Button
            type="submit"
            label="Save"
            disabled={!isInputDollarsValid}
            isLoading={isSaving}
          />
        </form>
      }
    >
      <ContextItem.Description description="Maximum cost per skill per self-improvement run (in USD). Once reached, no further self-improvement runs are started for that skill." />
    </ContextItem>
  );
}

function ReinforcementCapItem({ owner }: ReinforcementSectionProps) {
  const { capDollars, isSaving, saveCapDollars } = useReinforcementCapSetting({
    owner,
  });
  const [inputValue, setInputValue] = useState<string>(() =>
    String(capDollars)
  );

  const parsedInput = Number(inputValue);
  const isInputValid =
    inputValue.trim() !== "" &&
    Number.isFinite(parsedInput) &&
    parsedInput >= 0;

  const defaultDollars = DEFAULT_REINFORCEMENT_CAP_MICRO_USD / 1_000_000;

  const handleSave = async () => {
    if (!isInputValid) {
      return;
    }
    await saveCapDollars(parsedInput);
  };

  return (
    <ContextItem
      title="Global spending cap"
      visual={<CardIcon className="h-6 w-6 shrink-0" />}
      hasSeparatorIfLast={true}
      action={
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <div className="w-32">
            <Input
              name="reinforcementCap"
              placeholder={String(defaultDollars)}
              value={inputValue}
              message={
                !isInputValid && inputValue !== ""
                  ? "Enter a non-negative number."
                  : undefined
              }
              messageStatus={
                !isInputValid && inputValue !== "" ? "error" : undefined
              }
              onChange={(event) => setInputValue(event.target.value)}
              disabled={isSaving}
            />
          </div>
          <Button
            type="submit"
            label="Save"
            disabled={!isInputValid}
            isLoading={isSaving}
          />
        </form>
      }
    >
      <ContextItem.Description description="Self-improving skills is priced as programmatic usage. This is the maximum cost per month (in USD) for the feature across all skills. Once reached, no new self-improving runs are started until the next billing month." />
    </ContextItem>
  );
}
