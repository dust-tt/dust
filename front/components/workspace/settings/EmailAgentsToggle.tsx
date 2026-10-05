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
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

const DOCUMENTATION_URL = "https://docs.dust.tt/docs/email-agents";

interface EmailAgentsToggleProps {
  owner: WorkspaceType;
}

export function EmailAgentsToggle({ owner }: EmailAgentsToggleProps) {
  const { t } = useLingui();
  const { isEnabled, isChanging, doToggleEmailAgents } = useEmailAgentsToggle({
    owner,
  });
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const confirmDialogTitle = isEnabled
    ? t`Disable email agents`
    : t`Enable email agents`;
  const confirmDialogDescription = isEnabled
    ? t`All users in your company will no longer be able to forward emails to their agents at AGENT_NAME@${ASSISTANT_EMAIL_SUBDOMAIN}.`
    : t`All users in your company will be able to forward emails to their agents. As a general rule, caution is advised when forwarding emails or attachments from untrusted sources, since those are exposed to security risks such as prompt injection.`;
  const confirmButtonLabel = isEnabled
    ? t`Disable email agents`
    : t`Enable email agents`;

  return (
    <>
      <GovernanceSettingRowLayout
        label={t`Email agents`}
        description={t`Whether members can reach agents by email at AGENT_NAME@${ASSISTANT_EMAIL_SUBDOMAIN}`}
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
              label: t`Cancel`,
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
