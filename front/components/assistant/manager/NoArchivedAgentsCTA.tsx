import {
  ArchiveUnusedAgentsModal,
  DEFAULT_INACTIVITY_THRESHOLD_DAYS,
} from "@app/components/workspace/ArchiveUnusedAgentsModal";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import type { WorkspaceType } from "@app/types/user";
import { getInactiveAgentArchivalThresholdDays } from "@app/types/user";
import { Archive, Button, EmptyCTA, Settings02 } from "@dust-tt/sparkle";
import { useState } from "react";

interface NoArchivedAgentsCTAProps {
  owner: WorkspaceType;
  onArchived: () => void;
}

/**
 * The archived tab with nothing in it. Offering "create an agent" here reads as a non-sequitur, so
 * this offers the thing that fills the tab instead — but only to someone who can actually do it:
 * archiving is admin-only and behind a flag, so anyone else gets the message without the button.
 */
export function NoArchivedAgentsCTA({
  owner,
  onArchived,
}: Readonly<NoArchivedAgentsCTAProps>) {
  const { isAdmin } = useAuth();
  const { hasFeature } = useFeatureFlags();
  const router = useAppRouter();

  const [isModalOpen, setIsModalOpen] = useState(false);

  const thresholdDays = getInactiveAgentArchivalThresholdDays(owner);

  if (!isAdmin || !hasFeature("archive_inactive_agents")) {
    return (
      <EmptyCTA
        title="No archived agents"
        message="Archived agents are kept here, out of everyone's way."
        action={null}
      />
    );
  }

  return (
    <>
      <EmptyCTA
        title="No archived agents"
        message={
          thresholdDays
            ? `No agent has been archived. Agents nobody has mentioned for ${thresholdDays} days will be automatically archived.`
            : "No agent has been archived. Agents nobody uses can be archived automatically, or right now."
        }
        action={
          <div className="flex flex-row items-center gap-2">
            {!thresholdDays && (
              <Button
                label="Enable daily checks"
                icon={Settings02}
                variant="outline"
                tooltip="Set it up in the workspace's governance settings."
                onClick={() => void router.push(`/w/${owner.sId}/governance`)}
              />
            )}
            <Button
              label="Archive unused now"
              icon={Archive}
              variant={thresholdDays ? "outline" : "primary"}
              onClick={() => setIsModalOpen(true)}
            />
          </div>
        }
      />
      <ArchiveUnusedAgentsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        owner={owner}
        initialThresholdDays={
          thresholdDays ?? DEFAULT_INACTIVITY_THRESHOLD_DAYS
        }
        onArchived={onArchived}
      />
    </>
  );
}
