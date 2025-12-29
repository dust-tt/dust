import {
  Checkbox,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { useAcceptSuggestion } from "@app/lib/swr/skill_configurations";
import type { LightWorkspaceType } from "@app/types";
import type { SkillWithRelationsType } from "@app/types/assistant/skill_configuration";

interface AcceptSuggestionDialogProps {
  skill: SkillWithRelationsType;
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
}

export function AcceptSuggestionDialog({
  skill,
  isOpen,
  onClose,
  owner,
}: AcceptSuggestionDialogProps) {
  const [isAccepting, setIsAccepting] = useState(false);
  const doAccept = useAcceptSuggestion({ owner, skill });

  const agents = skill.relations.usage?.agents ?? [];

  // Track selected agents by their sId - all unselected by default
  const [selectedAgentSIds, setSelectedAgentSIds] = useState<Set<string>>(
    new Set()
  );

  const handleAgentToggle = (agentSId: string) => {
    setSelectedAgentSIds((prev) => {
      const next = new Set(prev);
      if (next.has(agentSId)) {
        next.delete(agentSId);
      } else {
        next.add(agentSId);
      }
      return next;
    });
  };

  const handleAccept = async () => {
    setIsAccepting(true);
    const success = await doAccept(Array.from(selectedAgentSIds));
    setIsAccepting(false);
    if (success) {
      onClose();
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader hideButton>
          <DialogTitle>Accept skill suggestion</DialogTitle>
          <DialogDescription>
            <div>
              Accept the skill{" "}
              <span className="font-bold">{skill.name}</span> and select which
              agents should use it.
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          {agents.length > 0 ? (
            <div className="flex flex-col gap-3">
              <div className="font-semibold">
                Select agents to use this skill:
              </div>
              <div className="flex max-h-60 flex-col gap-2 overflow-y-auto">
                {agents.map((agent) => (
                  <div key={agent.sId} className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedAgentSIds.has(agent.sId)}
                      onCheckedChange={() => handleAgentToggle(agent.sId)}
                    />
                    <span className="text-sm">{agent.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground dark:text-muted-foreground-night">
              No agents are currently associated with this skill.
            </div>
          )}
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            disabled: isAccepting,
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Accept",
            disabled: isAccepting,
            variant: "primary",
            onClick: handleAccept,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
