import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import {
  ArchiveUnusedAgentsModal,
  DEFAULT_INACTIVITY_THRESHOLD_DAYS,
} from "@app/components/workspace/ArchiveUnusedAgentsModal";
import {
  MAX_INACTIVITY_THRESHOLD_DAYS,
  MIN_INACTIVITY_THRESHOLD_DAYS,
} from "@app/lib/api/assistant/inactivity/policy";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useUpdateInactiveAgentArchival } from "@app/lib/swr/assistants";
import type { WorkspaceType } from "@app/types/user";
import { getInactiveAgentArchivalThresholdDays } from "@app/types/user";
import { Button, Input, SliderToggle } from "@dust-tt/sparkle";
import { useState } from "react";

const LABEL = "Archive unused agents";
const DESCRIPTION =
  "Archive agents nobody has mentioned for this many days. Agents with a schedule are excluded.";

interface InactiveAgentArchivalProps {
  owner: WorkspaceType;
}

export function InactiveAgentArchival({ owner }: InactiveAgentArchivalProps) {
  const { hasFeature } = useFeatureFlags();

  const updateInactiveAgentArchival = useUpdateInactiveAgentArchival({ owner });

  const savedThresholdDays = getInactiveAgentArchivalThresholdDays(owner);

  const [isEnabled, setIsEnabled] = useState(savedThresholdDays !== null);
  const [thresholdDays, setThresholdDays] = useState(
    String(savedThresholdDays ?? DEFAULT_INACTIVITY_THRESHOLD_DAYS)
  );
  const [isChanging, setIsChanging] = useState(false);
  const [isRunNowOpen, setIsRunNowOpen] = useState(false);

  if (!hasFeature("archive_inactive_agents")) {
    return null;
  }

  const parsedThresholdDays = Number(thresholdDays);
  const isThresholdValid =
    Number.isInteger(parsedThresholdDays) &&
    parsedThresholdDays >= MIN_INACTIVITY_THRESHOLD_DAYS &&
    parsedThresholdDays <= MAX_INACTIVITY_THRESHOLD_DAYS;

  const onToggle = async () => {
    setIsChanging(true);
    const enabling = !isEnabled;
    const saved = await updateInactiveAgentArchival(
      enabling ? parsedThresholdDays : null
    );
    if (saved) {
      setIsEnabled(enabling);
    }
    setIsChanging(false);
  };

  // Committed on blur rather than per keystroke, so a half-typed number is never saved.
  const onThresholdBlur = async () => {
    if (!isEnabled || !isThresholdValid) {
      return;
    }
    if (parsedThresholdDays === savedThresholdDays) {
      return;
    }

    setIsChanging(true);
    await updateInactiveAgentArchival(parsedThresholdDays);
    setIsChanging(false);
  };

  return (
    <>
      <GovernanceSettingRowLayout
        label={LABEL}
        description={DESCRIPTION}
        action={
          <div className="flex flex-row items-center gap-3">
            <Button
              label="Run now"
              variant="outline"
              size="sm"
              disabled={isChanging}
              onClick={() => setIsRunNowOpen(true)}
              tooltip="Review what would be archived, then archive it."
            />
            <Input
              value={thresholdDays}
              onChange={(e) => setThresholdDays(e.target.value)}
              onBlur={onThresholdBlur}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              size="sm"
              className="w-24"
              containerClassName="w-auto"
              disabled={isChanging}
              isError={!isThresholdValid}
              suffix="days"
            />
            <SliderToggle
              selected={isEnabled}
              disabled={isChanging || !isThresholdValid}
              onClick={onToggle}
            />
          </div>
        }
      />
      <ArchiveUnusedAgentsModal
        isOpen={isRunNowOpen}
        onClose={() => setIsRunNowOpen(false)}
        owner={owner}
        initialThresholdDays={
          isThresholdValid
            ? parsedThresholdDays
            : (savedThresholdDays ?? DEFAULT_INACTIVITY_THRESHOLD_DAYS)
        }
        onArchived={() => {}}
      />
    </>
  );
}
