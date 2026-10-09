import { useIsSelfImprovementAvailable } from "@app/lib/client/self_improvement";
import { formatNumber } from "@app/lib/i18n/format";
import {
  useProgrammaticUsageLimit,
  useUpdateProgrammaticUsageLimit,
} from "@app/lib/swr/usage_settings";
import type { LightWorkspaceType } from "@app/types/user";
import { InputWithSave, SettingsList } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

import {
  normalizeCapInput,
  useCapUnitLabel,
} from "@app/components/workspace/settings/selfImprovingSkillsCapUtils";
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

interface SelfImprovingSkillsCapsSectionProps {
  owner: LightWorkspaceType;
}

function SelfImprovingSkillsCapsSection({
  owner,
}: SelfImprovingSkillsCapsSectionProps) {
  return (
    <>
      <SelfImprovingCapItem owner={owner} />
      <SelfImprovementCapPerSkillItem owner={owner} />
    </>
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
    <SettingsList.Row
      title={t`Default cost cap per skill`}
      description={
        unit === "awu_credits"
          ? t`Maximum cost per skill per self-improvement run (in credits). Once reached, no further self-improvement runs are started for that skill.`
          : t`Maximum cost per skill per self-improvement run (in USD). Once reached, no further self-improvement runs are started for that skill.`
      }
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
    />
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
    <SettingsList.Row
      title={t`Global spending cap`}
      description={
        unit === "awu_credits"
          ? t`Self-improving skills is priced as programmatic usage. This is the maximum cost per month (in credits) for the feature across all skills. Once reached, no new self-improving runs are started until the next billing month.`
          : t`Self-improving skills is priced as programmatic usage. This is the maximum cost per month (in USD) for the feature across all skills. Once reached, no new self-improving runs are started until the next billing month.`
      }
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
    ></SettingsList.Row>
  );
}

interface UsageProgrammaticLimitCardProps {
  owner: LightWorkspaceType;
}

export function UsageProgrammaticLimitCard({
  owner,
}: UsageProgrammaticLimitCardProps) {
  const { t } = useLingui();
  const hasSelfImprovement = useIsSelfImprovementAvailable();
  const { programmaticUsageLimit, isProgrammaticUsageLimitLoading } =
    useProgrammaticUsageLimit({ workspaceId: owner.sId });
  const { doUpdateProgrammaticUsageLimit } = useUpdateProgrammaticUsageLimit({
    workspaceId: owner.sId,
  });

  const currentLimit = programmaticUsageLimit?.monthlyCapCredits ?? 0;

  const [isEditing, setIsEditing] = useState(false);

  const handleSaveLimit = async (newValue: string) => {
    const trimmed = newValue.trim();

    // An empty value means no programmatic access: save 0 so the cap blocks
    // access. There is no "no cap" / unlimited state.
    if (trimmed === "") {
      if (currentLimit === 0) {
        return;
      }
      await doUpdateProgrammaticUsageLimit(0);
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed === currentLimit) {
      // The component reverts to the current value when nothing is persisted.
      return;
    }
    await doUpdateProgrammaticUsageLimit(parsed);
  };

  return (
    <>
      <span className="heading-base text-foreground">
        <Trans>Programmatic usage</Trans>
      </span>
      <SettingsList>
        <SettingsList.Row
          title={t`Programmatic monthly limit`}
          description={
            <Trans>
              Maximum credits allowed for programmatic usage per month.{" "}
              <strong>Set to 0 to block all programmatic access.</strong>
            </Trans>
          }
          action={
            <div className="w-52">
              <InputWithSave
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder={t`No access`}
                value={currentLimit === 0 ? "" : formatNumber(currentLimit)}
                unit={currentLimit === 0 && !isEditing ? undefined : t`credits`}
                normalizeValue={(value) => value.replace(/[^\d]/g, "")}
                formatValue={(value) =>
                  value ? formatNumber(Number(value)) : value
                }
                onSave={handleSaveLimit}
                onFocus={() => setIsEditing(true)}
                onBlur={() => setIsEditing(false)}
                disabled={isProgrammaticUsageLimitLoading}
              />
            </div>
          }
        />
        {hasSelfImprovement && <SelfImprovingSkillsCapsSection owner={owner} />}
      </SettingsList>
    </>
  );
}
