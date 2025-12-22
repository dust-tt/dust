import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  Input,
  TextArea,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import React, { useMemo, useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { sendAgentReinforcerConversation } from "@app/lib/development";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import type { LightWorkspaceType, WhitelistableFeature } from "@app/types";

interface AgentReinforcerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
  featureFlags: WhitelistableFeature[];
}

export function AgentReinforcerDialog({
  isOpen,
  onClose,
  owner,
  featureFlags,
}: AgentReinforcerDialogProps) {
  const router = useRouter();
  const sendNotification = useSendNotification();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [editInstructions, setEditInstructions] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { agentConfigurations, isAgentConfigurationsLoading } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: "list",
      includes: [],
      disabled: !isOpen,
    });

  const filteredAgents = useMemo(() => {
    if (!searchQuery) {
      return agentConfigurations;
    }
    const lowerQuery = searchQuery.toLowerCase();
    return agentConfigurations.filter(
      (agent) =>
        agent.name.toLowerCase().includes(lowerQuery) ||
        agent.sId.toLowerCase().includes(lowerQuery)
    );
  }, [agentConfigurations, searchQuery]);

  const selectedAgent = useMemo(() => {
    return agentConfigurations.find((a) => a.sId === selectedAgentId);
  }, [agentConfigurations, selectedAgentId]);

  const handleSubmit = async () => {
    if (!selectedAgentId) {
      sendNotification({
        type: "error",
        title: "No agent selected",
        description: "Please select an agent to reinforce.",
      });
      return;
    }

    setIsSubmitting(true);
    const result = await sendAgentReinforcerConversation(
      owner,
      featureFlags,
      selectedAgentId,
      editInstructions
    );

    if (result.isOk) {
      sendNotification({
        type: "success",
        title: "Success!",
        description: "Agent reinforcer conversation created (redirecting...)",
      });
      onClose();
      setTimeout(() => {
        void router.push(
          `/w/${owner.sId}/conversation/${result.conversationSId}`
        );
      }, 1000);
    } else {
      sendNotification({
        type: "error",
        title: "Error",
        description: result.error,
      });
    }
    setIsSubmitting(false);
  };

  const handleClose = () => {
    setSelectedAgentId(null);
    setEditInstructions("");
    setSearchQuery("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Agent Reinforcer</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium">
                Select Agent
              </label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Input
                    placeholder={
                      isAgentConfigurationsLoading
                        ? "Loading agents..."
                        : "Select an agent..."
                    }
                    value={selectedAgent?.name ?? ""}
                    name="agent-select"
                    readOnly
                    className="cursor-pointer"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-64 w-96 overflow-y-auto">
                  <DropdownMenuSearchbar
                    placeholder="Search agents..."
                    value={searchQuery}
                    onChange={setSearchQuery}
                    name="agent-search"
                  />
                  {filteredAgents.map((agent) => (
                    <DropdownMenuItem
                      key={agent.sId}
                      label={`@${agent.name}`}
                      description={agent.sId}
                      onClick={() => {
                        setSelectedAgentId(agent.sId);
                        setSearchQuery("");
                      }}
                    />
                  ))}
                  {filteredAgents.length === 0 && (
                    <div className="p-2 text-center text-sm text-muted-foreground">
                      No agents found
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Edit Instructions
              </label>
              <TextArea
                placeholder="Describe what improvements you want to make to this agent's prompt..."
                value={editInstructions}
                onChange={(e) => setEditInstructions(e.target.value)}
                minRows={4}
              />
            </div>
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: handleClose,
          }}
          rightButtonProps={{
            label: isSubmitting ? "Creating..." : "Create Conversation",
            variant: "primary",
            onClick: handleSubmit,
            disabled: isSubmitting || !selectedAgentId,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
