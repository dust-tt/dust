import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { useValidateAction } from "@app/hooks/useValidateAction";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { getEmailComposeFields } from "@app/lib/actions/mcp_email_tools";
import { useAuth } from "@app/lib/auth/AuthContext";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import {
  Button,
  ChevronDownIcon,
  ContentMessage,
  Input,
  TextArea,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface EmailComposerValidationProps {
  triggeringUser: UserType | null;
  owner: LightWorkspaceType;
  blockedAction: BlockedToolExecution;
}

function parseEmailList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map(String).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
  }
  return [];
}

function emailListToString(list: string[]): string {
  return list.join(", ");
}

export function EmailComposerValidation({
  triggeringUser,
  owner,
  blockedAction,
}: EmailComposerValidationProps) {
  const { user } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCcBcc, setShowCcBcc] = useState(false);

  const { removeCompletedAction, isActionPulsing, stopPulsingAction } =
    useBlockedActionsContext();
  const { validateAction, isValidating } = useValidateAction({
    owner,
    onError: setErrorMessage,
  });

  const fields = useMemo(
    () =>
      getEmailComposeFields(
        blockedAction.metadata.mcpServerName,
        blockedAction.metadata.toolName
      ),
    [blockedAction.metadata.mcpServerName, blockedAction.metadata.toolName]
  );

  const inputs = blockedAction.inputs;

  const [to, setTo] = useState(() =>
    emailListToString(parseEmailList(inputs.to))
  );
  const [cc, setCc] = useState(() =>
    emailListToString(parseEmailList(inputs.cc))
  );
  const [bcc, setBcc] = useState(() =>
    emailListToString(parseEmailList(inputs.bcc))
  );
  const [subject, setSubject] = useState(() =>
    typeof inputs.subject === "string" ? inputs.subject : ""
  );
  const [body, setBody] = useState(() =>
    typeof inputs.body === "string" ? inputs.body : ""
  );

  const isTriggeredByCurrentUser = useMemo(
    () => blockedAction.userId === user?.sId,
    [blockedAction.userId, user?.sId]
  );

  const isPulsing = isActionPulsing(blockedAction.actionId);

  const buildUpdatedInputs = (): Record<string, unknown> => {
    const updated: Record<string, unknown> = { ...inputs };
    if (fields?.to) {
      updated.to = parseEmailList(to);
    }
    if (fields?.cc) {
      updated.cc = parseEmailList(cc);
    }
    if (fields?.bcc) {
      updated.bcc = parseEmailList(bcc);
    }
    if (fields?.subject) {
      updated.subject = subject;
    }
    if (fields?.body) {
      updated.body = body;
    }
    return updated;
  };

  const handleSend = async () => {
    stopPulsingAction(blockedAction.actionId);
    setErrorMessage(null);

    const result = await validateAction({
      validationRequest: blockedAction,
      approved: "approved",
      updatedInputs: buildUpdatedInputs(),
    });

    if (!result.success) {
      setErrorMessage("Failed to send email. Please try again.");
      return;
    }
    removeCompletedAction(blockedAction.actionId);
  };

  const handleDiscard = async () => {
    stopPulsingAction(blockedAction.actionId);
    setErrorMessage(null);

    const result = await validateAction({
      validationRequest: blockedAction,
      approved: "rejected",
    });

    if (!result.success) {
      setErrorMessage("Failed to discard email. Please try again.");
      return;
    }
    removeCompletedAction(blockedAction.actionId);
  };

  const hasCcOrBcc =
    parseEmailList(inputs.cc).length > 0 ||
    parseEmailList(inputs.bcc).length > 0;

  const showExpandedCcBcc = showCcBcc || hasCcOrBcc;

  return (
    <ContentMessage
      title="Review email draft"
      variant="primary"
      className="flex w-full flex-col gap-0 overflow-hidden rounded-xl sm:w-80 sm:min-w-[500px]"
    >
      {isTriggeredByCurrentUser ? (
        <div className="flex flex-col">
          <div className="flex flex-col divide-y divide-border dark:divide-border-night">
            {fields?.to && (
              <div className="flex flex-row items-start gap-2 px-1 py-2">
                <span className="w-12 shrink-0 pt-1 text-xs font-medium text-muted-foreground dark:text-muted-foreground-night">
                  To
                </span>
                <Input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="recipient@example.com"
                  className="flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                />
              </div>
            )}
            {fields?.cc && fields?.bcc && (
              <>
                {!showExpandedCcBcc ? (
                  <div className="px-1 py-2">
                    <button
                      type="button"
                      onClick={() => setShowCcBcc(true)}
                      className="flex flex-row items-center gap-1 text-xs text-muted-foreground hover:text-foreground dark:text-muted-foreground-night dark:hover:text-foreground-night"
                    >
                      <span>CC / BCC</span>
                      <ChevronDownIcon className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-row items-start gap-2 px-1 py-2">
                      <span className="w-12 shrink-0 pt-1 text-xs font-medium text-muted-foreground dark:text-muted-foreground-night">
                        CC
                      </span>
                      <Input
                        value={cc}
                        onChange={(e) => setCc(e.target.value)}
                        placeholder="cc@example.com"
                        className="flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                      />
                    </div>
                    <div className="flex flex-row items-start gap-2 px-1 py-2">
                      <span className="w-12 shrink-0 pt-1 text-xs font-medium text-muted-foreground dark:text-muted-foreground-night">
                        BCC
                      </span>
                      <Input
                        value={bcc}
                        onChange={(e) => setBcc(e.target.value)}
                        placeholder="bcc@example.com"
                        className="flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                      />
                    </div>
                  </>
                )}
              </>
            )}
            {fields?.subject && (
              <div className="flex flex-row items-start gap-2 px-1 py-2">
                <span className="w-12 shrink-0 pt-1 text-xs font-medium text-muted-foreground dark:text-muted-foreground-night">
                  Subject
                </span>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject"
                  className="flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                />
              </div>
            )}
          </div>
          {fields?.body && (
            <div className="mt-2">
              <TextArea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Email body..."
                minRows={6}
                resize="vertical"
                className="w-full border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
              />
            </div>
          )}
          {errorMessage && (
            <div className="mt-2 text-sm font-medium text-warning-800 dark:text-warning-800-night">
              {errorMessage}
            </div>
          )}
          <div className="mt-3 flex flex-row gap-2 self-end">
            <Button
              label="Discard"
              variant="outline"
              size="xs"
              icon={XMarkIcon}
              disabled={isValidating}
              isPulsing={isPulsing}
              onClick={() => void handleDiscard()}
            />
            <Button
              label="Send email"
              variant="highlight"
              size="xs"
              disabled={isValidating}
              isPulsing={isPulsing}
              onClick={() => void handleSend()}
            />
          </div>
        </div>
      ) : (
        <div className="font-sm whitespace-normal break-words text-foreground dark:text-foreground-night">
          Waiting for{" "}
          <span className="font-semibold">{triggeringUser?.fullName}</span> to
          review and send.
        </div>
      )}
    </ContentMessage>
  );
}
