import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { useEmailAgentsToggle } from "@app/hooks/useEmailAgentsToggle";
import { ASSISTANT_EMAIL_SUBDOMAIN } from "@app/lib/api/assistant/email/constants";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SliderToggle,
} from "@dust-tt/sparkle";
import { useState } from "react";

const ENABLE_EMAIL_AGENTS_CONFIRMATION_MESSAGE =
  "All users in your company will be able to forward emails to their agents. " +
  "As a general rule, caution is advised when forwarding emails or attachments " +
  "from untrusted sources, since those are exposed to security risks such as " +
  "prompt injection.";

export const EMAIL_AGENTS_LABEL = "Email agents";
export const EMAIL_AGENTS_DESCRIPTION = `Whether members can reach agents by email at AGENT_NAME@${ASSISTANT_EMAIL_SUBDOMAIN}`;
const DOCUMENTATION_URL = "https://docs.dust.tt/docs/email-agents";

interface EmailAgentsToggleProps {
  owner: WorkspaceType;
}

export function EmailAgentsToggle({ owner }: EmailAgentsToggleProps) {
  const { isEnabled, isChanging, doToggleEmailAgents } = useEmailAgentsToggle({
    owner,
  });
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const confirmDialogTitle = isEnabled
    ? "Disable email agents"
    : "Enable email agents";
  const confirmDialogDescription = isEnabled
    ? `All users in your company will no longer be able to forward emails to their agents at AGENT_NAME@${ASSISTANT_EMAIL_SUBDOMAIN}.`
    : ENABLE_EMAIL_AGENTS_CONFIRMATION_MESSAGE;
  const confirmButtonLabel = isEnabled
    ? "Disable email agents"
    : "Enable email agents";

  return (
    <>
      <GovernanceSettingRowLayout
        label={EMAIL_AGENTS_LABEL}
        description={EMAIL_AGENTS_DESCRIPTION}
        documentationUrl={DOCUMENTATION_URL}
        action={
          <SliderToggle
            selected={isEnabled}
            disabled={isChanging}
            onClick={() => {
              setIsConfirmOpen(true);
            }}
          />
        }
      />
      <Dialog
        open={isConfirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsConfirmOpen(false);
          }
        }}
      >
        <DialogContent size="md" isAlertDialog>
          <DialogHeader hideButton>
            <DialogTitle>{confirmDialogTitle}</DialogTitle>
            <DialogDescription>{confirmDialogDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              disabled: isChanging,
              variant: "outline",
            }}
          >
            <Button
              label={confirmButtonLabel}
              disabled={isChanging}
              variant={isEnabled ? "warning" : "primary"}
              onClick={async () => {
                const isSuccess = await doToggleEmailAgents();

                if (isSuccess) {
                  setIsConfirmOpen(false);
                }
              }}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
