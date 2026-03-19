import { useEmailAgentsToggle } from "@app/hooks/useEmailAgentsToggle";
import { ASSISTANT_EMAIL_SUBDOMAIN } from "@app/lib/api/assistant/email/constants";
import type { WorkspaceType } from "@app/types/user";
import {
  ActionMailAiIcon,
  BookOpenIcon,
  ContextItem,
  SliderToggle,
} from "@dust-tt/sparkle";

interface EmailAgentsToggleProps {
  owner: WorkspaceType;
}

export function EmailAgentsToggle({ owner }: EmailAgentsToggleProps) {
  const { isEnabled, isChanging, doToggleEmailAgents } = useEmailAgentsToggle({
    owner,
  });

  return (
    <ContextItem
      title="Email agents"
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
          onClick={doToggleEmailAgents}
        />
      }
    />
  );
}
