import { useEmailAgentsToggle } from "@app/hooks/useEmailAgentsToggle";
import { ASSISTANT_EMAIL_SUBDOMAIN } from "@app/lib/api/assistant/email/constants";
import type { WorkspaceType } from "@app/types/user";
import {
  ActionMailAiIcon,
  BookOpenIcon,
  Button,
  Chip,
  ContextItem,
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
      <ContextItem
        title={
          <div className="flex items-center gap-2">
            <span>Email agents</span>
            <Chip size="xs" color="golden" label="Beta" />
          </div>
        }
        subElement={
          <div className="flex flex-row items-center gap-2">
            <span>
              Allow workspace members to email agents at{" "}
              <code>AGENT_NAME@{ASSISTANT_EMAIL_SUBDOMAIN}</code>
            </span>
            <a
              href="https://dust-tt.notion.site/Email-Agents-32028599d94181209594fbf1402b720d"
              target="_blank"
              rel="noopener noreferrer"
              className="text-action-400 hover:text-action-500 text-sm"
            >
              <BookOpenIcon className="h-4 w-4" />
            </a>
          </div>
        }
        visual={<ActionMailAiIcon className="h-6 w-6" />}
        hasSeparatorIfLast={true}
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
