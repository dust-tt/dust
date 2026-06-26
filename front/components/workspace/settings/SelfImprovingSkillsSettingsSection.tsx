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
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { WorkspaceType } from "@app/types/user";
import {
  ContextItem,
  InputWithSave,
  Page,
  SliderToggle,
} from "@dust-tt/sparkle";
import { useState } from "react";

export function capUnitLabel(unit: ReinforcementBillingUnit): string {
  switch (unit) {
    case "awu_credits":
      return "credits";
    case "micro_usd":
      return "$";
    default:
      assertNeverAndIgnore(unit);
      return "";
  }
}

// Credits are integers; dollars allow decimals.
export function normalizeCapInput(
  value: string,
  unit: ReinforcementBillingUnit
): string {
  switch (unit) {
    case "awu_credits":
      return value.replace(/[^\d]/g, "");
    case "micro_usd":
      return value.replace(/[^\d.]/g, "");
    default:
      assertNeverAndIgnore(unit);
      return value.replace(/[^\d.]/g, "");
  }
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
  const { unit, cap, saveCap } = useSelfImprovementCapPerSkillSetting({
    owner,
  });
  // InputWithSave displays `value` once editing ends, and `owner` is not
  // refetched after save: track the saved value locally.
  const [savedValue, setSavedValue] = useState<string>(() => String(cap));

  const defaultCap =
    unit === "awu_credits"
      ? DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_AWU_CREDITS
      : DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_MICRO_USD / 1_000_000;

  const handleSave = async (newValue: string) => {
    const trimmed = newValue.trim();
    const parsed = Number(trimmed);
    if (trimmed === "" || !Number.isFinite(parsed) || parsed < 0) {
      // Revert to the saved value.
      return;
    }
    const ok = await saveCap(parsed);
    if (!ok) {
      // Keep editing; the hook already sent an error notification.
      throw new Error("Failed to update self-improvement cost cap per skill");
    }
    setSavedValue(String(parsed));
    onSaved?.(parsed);
  };

  return (
    <ContextItem
      title="Default cost cap per skill"
      visual={<></>}
      hasSeparatorIfLast={true}
      action={
        <div className="w-48">
          <InputWithSave
            name="selfImprovementCapPerSkill"
            inputMode={unit === "awu_credits" ? "numeric" : "decimal"}
            placeholder={String(defaultCap)}
            value={savedValue}
            unit={capUnitLabel(unit)}
            normalizeValue={(value) => normalizeCapInput(value, unit)}
            onSave={handleSave}
          />
        </div>
      }
    >
      <ContextItem.Description
        description={`Maximum cost per skill per self-improvement run (in ${unit === "awu_credits" ? "credits" : "USD"}). Once reached, no further self-improvement runs are started for that skill.`}
      />
    </ContextItem>
  );
}

function SelfImprovingCapItem({
  owner,
  onCapSaved,
}: SelfImprovingSkillsSettingsSectionProps) {
  const { unit, cap, saveCap } = useSelfImprovingCapSetting({
    owner,
  });
  // InputWithSave displays `value` once editing ends, and `owner` is not
  // refetched after save: track the saved value locally.
  const [savedValue, setSavedValue] = useState<string>(() => String(cap));

  const defaultCap =
    unit === "awu_credits"
      ? DEFAULT_REINFORCEMENT_CAP_AWU_CREDITS
      : DEFAULT_REINFORCEMENT_CAP_MICRO_USD / 1_000_000;

  const handleSave = async (newValue: string) => {
    const trimmed = newValue.trim();
    const parsed = Number(trimmed);
    if (trimmed === "" || !Number.isFinite(parsed) || parsed < 0) {
      // Revert to the saved value.
      return;
    }
    const ok = await saveCap(parsed);
    if (!ok) {
      // Keep editing; the hook already sent an error notification.
      throw new Error("Failed to update reinforcement spending cap");
    }
    setSavedValue(String(parsed));
    onCapSaved?.(parsed);
  };

  return (
    <ContextItem
      title="Global spending cap"
      visual={<></>}
      hasSeparatorIfLast={true}
      action={
        <div className="w-48">
          <InputWithSave
            name="reinforcementCap"
            inputMode={unit === "awu_credits" ? "numeric" : "decimal"}
            placeholder={String(defaultCap)}
            value={savedValue}
            unit={capUnitLabel(unit)}
            normalizeValue={(value) => normalizeCapInput(value, unit)}
            onSave={handleSave}
          />
        </div>
      }
    >
      <ContextItem.Description
        description={`Self-improving skills is priced as programmatic usage. This is the maximum cost per month (in ${unit === "awu_credits" ? "credits" : "USD"}) for the feature across all skills. Once reached, no new self-improving runs are started until the next billing month.`}
      />
    </ContextItem>
  );
}
