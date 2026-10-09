import {
  normalizeCapInput,
  useCapUnitLabel,
} from "@app/components/workspace/settings/selfImprovingSkillsCapUtils";
import { formatNumber } from "@app/lib/i18n/format";
import {
  DEFAULT_REINFORCEMENT_CAP_AWU_CREDITS,
  DEFAULT_REINFORCEMENT_CAP_MICRO_USD,
  DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_AWU_CREDITS,
  DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_MICRO_USD,
} from "@app/lib/reinforcement/constants";
import {
  useSelfImprovementCapPerSkillSetting,
  useSelfImprovingCapSetting,
} from "@app/lib/swr/useSelfImprovingSkillsSettings";
import type { LightWorkspaceType } from "@app/types/user";
import { ContextItem, InputWithSave, Page } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

interface SelfImprovingSkillsCapsSectionProps {
  owner: LightWorkspaceType;
}

export function SelfImprovingSkillsCapsSection({
  owner,
}: SelfImprovingSkillsCapsSectionProps) {
  return (
    <Page.Vertical align="stretch" gap="md">
      <ContextItem.List>
        <SelfImprovingCapItem owner={owner} />
        <SelfImprovementCapPerSkillItem owner={owner} />
      </ContextItem.List>
    </Page.Vertical>
  );
}

interface CapItemProps {
  owner: LightWorkspaceType;
}

function SelfImprovementCapPerSkillItem({ owner }: CapItemProps) {
  const { t } = useLingui();
  const { unit, cap, saveCap } = useSelfImprovementCapPerSkillSetting({
    owner,
  });
  const capUnit = useCapUnitLabel(unit);
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
  };

  return (
    <ContextItem
      title={t`Default cost cap per skill`}
      visual={<></>}
      hasSeparatorIfLast={true}
      action={
        <div className="w-48">
          <InputWithSave
            name="selfImprovementCapPerSkill"
            inputMode={unit === "awu_credits" ? "numeric" : "decimal"}
            placeholder={formatNumber(defaultCap)}
            value={savedValue}
            unit={capUnit}
            normalizeValue={(value) => normalizeCapInput(value, unit)}
            onSave={handleSave}
          />
        </div>
      }
    >
      <ContextItem.Description
        description={
          unit === "awu_credits"
            ? t`Maximum cost per skill per self-improvement run (in credits). Once reached, no further self-improvement runs are started for that skill.`
            : t`Maximum cost per skill per self-improvement run (in USD). Once reached, no further self-improvement runs are started for that skill.`
        }
      />
    </ContextItem>
  );
}

function SelfImprovingCapItem({ owner }: CapItemProps) {
  const { t } = useLingui();
  const { unit, cap, saveCap } = useSelfImprovingCapSetting({
    owner,
  });
  const capUnit = useCapUnitLabel(unit);
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
  };

  return (
    <ContextItem
      title={t`Global spending cap`}
      visual={<></>}
      hasSeparatorIfLast={true}
      action={
        <div className="w-48">
          <InputWithSave
            name="reinforcementCap"
            inputMode={unit === "awu_credits" ? "numeric" : "decimal"}
            placeholder={formatNumber(defaultCap)}
            value={savedValue}
            unit={capUnit}
            normalizeValue={(value) => normalizeCapInput(value, unit)}
            onSave={handleSave}
          />
        </div>
      }
    >
      <ContextItem.Description
        description={
          unit === "awu_credits"
            ? t`Self-improving skills is priced as programmatic usage. This is the maximum cost per month (in credits) for the feature across all skills. Once reached, no new self-improving runs are started until the next billing month.`
            : t`Self-improving skills is priced as programmatic usage. This is the maximum cost per month (in USD) for the feature across all skills. Once reached, no new self-improving runs are started until the next billing month.`
        }
      />
    </ContextItem>
  );
}
