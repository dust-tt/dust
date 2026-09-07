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
import { cn, InputWithSave, SliderToggle } from "@dust-tt/sparkle";
import { useState } from "react";

export const INACTIVE_AGENT_ARCHIVAL_LABEL = "Archive unused agents";
export const INACTIVE_AGENT_ARCHIVAL_DESCRIPTION =
  "Automatically archive unused agents";

interface InactiveAgentArchivalProps {
  owner: WorkspaceType;
}

export function InactiveAgentArchival({ owner }: InactiveAgentArchivalProps) {
  const { hasFeature } = useFeatureFlags();

  const updateInactiveAgentArchival = useUpdateInactiveAgentArchival({ owner });

  const savedThresholdDays = getInactiveAgentArchivalThresholdDays(owner);

  const [isEnabled, setIsEnabled] = useState(savedThresholdDays !== null);
  const [thresholdDays, setThresholdDays] = useState(
    savedThresholdDays ?? DEFAULT_INACTIVITY_THRESHOLD_DAYS
  );
  const [isChanging, setIsChanging] = useState(false);
  const [isRunOnceOpen, setIsRunOnceOpen] = useState(false);

  if (!hasFeature("archive_inactive_agents")) {
    return null;
  }

  const onToggle = async () => {
    setIsChanging(true);
    const enabling = !isEnabled;
    const saved = await updateInactiveAgentArchival(
      enabling ? thresholdDays : null
    );
    if (saved) {
      setIsEnabled(enabling);
    }
    setIsChanging(false);
  };

  const onThresholdSave = async (value: string) => {
    const parsed = Number(value);
    if (parsed === thresholdDays) {
      return;
    }

    const saved = await updateInactiveAgentArchival(parsed);
    if (saved) {
      setThresholdDays(parsed);
    }
  };

  return (
    <>
      <GovernanceSettingRowLayout
        label={INACTIVE_AGENT_ARCHIVAL_LABEL}
        description={
          <>
            {INACTIVE_AGENT_ARCHIVAL_DESCRIPTION}. Or{" "}
            <button
              type="button"
              className="underline"
              onClick={() => setIsRunOnceOpen(true)}
            >
              archive them once
            </button>
            .
          </>
        }
        action={
          <SliderToggle
            selected={isEnabled}
            disabled={isChanging}
            onClick={onToggle}
          />
        }
      />
      <GovernanceSettingRowLayout
        label={
          <span className={cn(!isEnabled && "text-faint")}>
            Inactivity threshold
          </span>
        }
        description={
          <span className={cn(!isEnabled && "text-faint")}>
            How long an agent has to go unmentioned before it's archived. Agents
            with a schedule are excluded.
          </span>
        }
        action={
          <div className="w-40 shrink-0">
            <InputWithSave
              value={String(thresholdDays)}
              onSave={onThresholdSave}
              normalizeValue={(value) => value.replace(/[^\d]/g, "")}
              validate={(value) => {
                const parsed = Number(value);
                return Number.isInteger(parsed) &&
                  parsed >= MIN_INACTIVITY_THRESHOLD_DAYS &&
                  parsed <= MAX_INACTIVITY_THRESHOLD_DAYS
                  ? null
                  : `Between ${MIN_INACTIVITY_THRESHOLD_DAYS} and ${MAX_INACTIVITY_THRESHOLD_DAYS}`;
              }}
              inputMode="numeric"
              pattern="[0-9]*"
              unit="days"
              disabled={isChanging || !isEnabled}
            />
          </div>
        }
      />
      <ArchiveUnusedAgentsModal
        isOpen={isRunOnceOpen}
        onClose={() => setIsRunOnceOpen(false)}
        owner={owner}
        initialThresholdDays={thresholdDays}
        onArchived={() => {}}
      />
    </>
  );
}
