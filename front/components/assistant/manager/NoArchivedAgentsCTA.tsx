import {
  ArchiveUnusedAgentsModal,
  DEFAULT_INACTIVITY_THRESHOLD_DAYS,
} from "@app/components/workspace/ArchiveUnusedAgentsModal";
import type { WorkspaceType } from "@app/types/user";
import { getInactiveAgentArchivalThresholdDays } from "@app/types/user";
import { Archive, Button, EmptyCTA } from "@dust-tt/sparkle";
import { useState } from "react";

interface NoArchivedAgentsCTAProps {
  owner: WorkspaceType;
  canArchiveUnusedAgents: boolean;
  onArchived: () => void;
}

/**
 * The archived tab with nothing in it. Offering "create an agent" here reads as a non-sequitur, so
 * this offers the thing that fills the tab instead.
 */
export function NoArchivedAgentsCTA({
  owner,
  canArchiveUnusedAgents,
  onArchived,
}: NoArchivedAgentsCTAProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const thresholdDays = getInactiveAgentArchivalThresholdDays(owner);

  if (!canArchiveUnusedAgents) {
    return <EmptyCTA message="No agent has been archived." action={null} />;
  }

  return (
    <>
      <EmptyCTA
        message={
          thresholdDays
            ? `No agent has been archived. Agents nobody has mentioned for ${thresholdDays} days can be archived.`
            : "No agent has been archived. Agents nobody uses can be archived."
        }
        action={
          <Button
            label="Archive unused agents"
            icon={Archive}
            variant="outline"
            onClick={() => setIsModalOpen(true)}
          />
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
