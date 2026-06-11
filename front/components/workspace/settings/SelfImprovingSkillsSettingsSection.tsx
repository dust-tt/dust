import {
  DEFAULT_REINFORCEMENT_CAP_AWU_CREDITS,
  DEFAULT_REINFORCEMENT_CAP_MICRO_USD,
  DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_AWU_CREDITS,
  DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_MICRO_USD,
} from "@app/lib/reinforcement/constants";
import type { ReinforcementBillingUnit } from "@app/lib/reinforcement/enforcement";
import {
  useSelfImprovementCapPerSkillSetting,
  useSelfImprovingBatchModeToggle,
  useSelfImprovingCapSetting,
  useSelfImprovingToggle,
} from "@app/lib/swr/useSelfImprovingSkillsSettings";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  ContextItem,
  Input,
  Page,
  SliderToggle,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface CapInputProps {
  name: string;
  placeholder: string;
  value: string;
  isInvalid: boolean;
  disabled: boolean;
  unit: ReinforcementBillingUnit;
  onChange: (value: string) => void;
}

// Cap input with the unit displayed inside the field, mirroring the spend
// limit input of the usage page (EditSpendLimitModal).
function CapInput({
  name,
  placeholder,
  value,
  isInvalid,
  disabled,
  unit,
  onChange,
}: CapInputProps) {
  const isCredits = unit === "awu_credits";
  return (
    <div className={isCredits ? "w-40" : "w-32"}>
      <div className="relative">
        <Input
          name={name}
          placeholder={placeholder}
          value={value}
          message={isInvalid ? "Enter a non-negative number." : undefined}
          messageStatus={isInvalid ? "error" : undefined}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className={isCredits ? "pr-16 text-right" : "pr-7 text-right"}
        />
        <span className="copy-sm pointer-events-none absolute right-3 top-0 flex h-9 items-center text-muted-foreground dark:text-muted-foreground-night">
          {isCredits ? "credits" : "$"}
        </span>
      </div>
    </div>
  );
}

interface SelfImprovingSkillsSettingsSectionProps {
  owner: WorkspaceType;
  // Saved cap values are in the display unit: AWU credits for workspaces
  // billed by Metronome, dollars otherwise.
  onCapSaved?: (cap: number) => void;
  onDefaultCapPerSkillSaved?: (cap: number) => void;
}

export function SelfImprovingSkillsSettingsSection({
  owner,
  onCapSaved,
  onDefaultCapPerSkillSaved,
}: SelfImprovingSkillsSettingsSectionProps) {
  const { isEnabled, isChanging, doToggleReinforcement } =
    useSelfImprovingToggle({ owner });

  return (
    <Page.Vertical align="stretch" gap="md">
      <Page.SectionHeader title="Settings" />
      <ContextItem.List>
        <div className="h-full border-b border-border dark:border-border-night" />
        <ContextItem
          title="Allow self-improving skills"
          visual={<></>}
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
        <SelfImprovingBatchModeToggle owner={owner} />
        <SelfImprovingCapItem owner={owner} onCapSaved={onCapSaved} />
        <SelfImprovementCapPerSkillItem
          owner={owner}
          onSaved={onDefaultCapPerSkillSaved}
        />
      </ContextItem.List>
    </Page.Vertical>
  );
}

function SelfImprovingBatchModeToggle({
  owner,
}: SelfImprovingSkillsSettingsSectionProps) {
  const { isEnabled, isChanging, doToggleBatchMode } =
    useSelfImprovingBatchModeToggle({ owner });

  return (
    <ContextItem
      title="Enable batch processing"
      visual={<></>}
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

interface SelfImprovementCapPerSkillItemProps {
  owner: WorkspaceType;
  onSaved?: (cap: number) => void;
}

function SelfImprovementCapPerSkillItem({
  owner,
  onSaved,
}: SelfImprovementCapPerSkillItemProps) {
  const { unit, cap, isSaving, saveCap } = useSelfImprovementCapPerSkillSetting(
    { owner }
  );
  const [inputValue, setInputValue] = useState<string>(() => String(cap));

  const parsedInput = Number(inputValue);
  const isInputValid =
    inputValue.trim() !== "" &&
    Number.isFinite(parsedInput) &&
    parsedInput >= 0;

  const defaultCap =
    unit === "awu_credits"
      ? DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_AWU_CREDITS
      : DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_MICRO_USD / 1_000_000;

  const handleSave = async () => {
    if (!isInputValid) {
      return;
    }
    const ok = await saveCap(parsedInput);
    if (ok) {
      onSaved?.(parsedInput);
    }
  };

  return (
    <ContextItem
      title="Default cost cap per skill"
      visual={<></>}
      hasSeparatorIfLast={true}
      action={
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <CapInput
            name="selfImprovementCapPerSkill"
            placeholder={String(defaultCap)}
            value={inputValue}
            isInvalid={!isInputValid && inputValue !== ""}
            disabled={isSaving}
            unit={unit}
            onChange={setInputValue}
          />
          <Button
            type="submit"
            label="Save"
            disabled={!isInputValid}
            isLoading={isSaving}
          />
        </form>
      }
    >
      <ContextItem.Description
        description={`Maximum cost per skill per self-improvement run (in ${unit === "awu_credits" ? "AWU credits" : "USD"}). Once reached, no further self-improvement runs are started for that skill.`}
      />
    </ContextItem>
  );
}

function SelfImprovingCapItem({
  owner,
  onCapSaved,
}: SelfImprovingSkillsSettingsSectionProps) {
  const { unit, cap, isSaving, saveCap } = useSelfImprovingCapSetting({
    owner,
  });
  const [inputValue, setInputValue] = useState<string>(() => String(cap));

  const parsedInput = Number(inputValue);
  const isInputValid =
    inputValue.trim() !== "" &&
    Number.isFinite(parsedInput) &&
    parsedInput >= 0;

  const defaultCap =
    unit === "awu_credits"
      ? DEFAULT_REINFORCEMENT_CAP_AWU_CREDITS
      : DEFAULT_REINFORCEMENT_CAP_MICRO_USD / 1_000_000;

  const handleSave = async () => {
    if (!isInputValid) {
      return;
    }
    const ok = await saveCap(parsedInput);
    if (ok) {
      onCapSaved?.(parsedInput);
    }
  };

  return (
    <ContextItem
      title="Global spending cap"
      visual={<></>}
      hasSeparatorIfLast={true}
      action={
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <CapInput
            name="reinforcementCap"
            placeholder={String(defaultCap)}
            value={inputValue}
            isInvalid={!isInputValid && inputValue !== ""}
            disabled={isSaving}
            unit={unit}
            onChange={setInputValue}
          />
          <Button
            type="submit"
            label="Save"
            disabled={!isInputValid}
            isLoading={isSaving}
          />
        </form>
      }
    >
      <ContextItem.Description
        description={`Self-improving skills is priced as programmatic usage. This is the maximum cost per month (in ${unit === "awu_credits" ? "AWU credits" : "USD"}) for the feature across all skills. Once reached, no new self-improving runs are started until the next billing month.`}
      />
    </ContextItem>
  );
}
