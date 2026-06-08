import type { EditableToolValidationComponentProps } from "@app/components/assistant/conversation/editable_tool_validation/types";
import type { GmailSendMailInput } from "@app/lib/api/actions/servers/gmail/types";
import { isGmailSendMailInput } from "@app/lib/api/actions/servers/gmail/types";
import {
  AttachmentChip,
  Button,
  Checkbox,
  Label,
  Paperclip,
  Trash01,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

// Subject is the only editable argument (see `editableArguments` in the gmail
// tool metadata); the body is shown read-only.
interface ComposeFormValues {
  subject: string;
}

// Subject is required, unless this is a reply (in which case `send_mail` derives
// the subject from the original message).
function getComposeFormSchema(isReply: boolean) {
  const subjectSchema = z.string().trim();

  return z.object({
    subject: isReply
      ? subjectSchema.optional()
      : subjectSchema.min(1, "Subject is required."),
  });
}

// Recipient rows shown read-only, in Gmail's compose order.
function getRecipientRows(
  inputs: GmailSendMailInput
): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (inputs.from) {
    rows.push({ label: "From", value: inputs.from });
  }
  if (inputs.to?.length) {
    rows.push({ label: "To", value: inputs.to.join(", ") });
  }
  if (inputs.cc?.length) {
    rows.push({ label: "Cc", value: inputs.cc.join(", ") });
  }
  if (inputs.bcc?.length) {
    rows.push({ label: "Bcc", value: inputs.bcc.join(", ") });
  }
  return rows;
}

interface RecipientRowProps {
  label: string;
  value: string;
}

function RecipientRow({ label, value }: RecipientRowProps) {
  return (
    <div className="flex gap-2 border-b border-border px-4 py-2 dark:border-border-night">
      <span className="shrink-0 text-sm text-muted-foreground dark:text-muted-foreground-night">
        {label}
      </span>
      <span className="break-words text-sm text-foreground dark:text-foreground-night">
        {value}
      </span>
    </div>
  );
}

export function GmailSendMailValidation({
  blockedAction,
  alwaysAllowLabel,
  isSubmitting,
  isPulsing,
  onApproveWithEditedArguments,
}: EditableToolValidationComponentProps) {
  const [neverAskAgain, setNeverAskAgain] = useState(false);

  const inputs = useMemo(
    () =>
      isGmailSendMailInput(blockedAction.inputs) ? blockedAction.inputs : null,
    [blockedAction.inputs]
  );

  const originalSubject = inputs?.subject ?? "";
  const originalBody = inputs?.body ?? "";
  const isReply = !!inputs?.replyToMessageId;

  const formSchema = useMemo(() => getComposeFormSchema(isReply), [isReply]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ComposeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { subject: originalSubject },
    mode: "onChange",
  });

  const attachmentName = inputs?.attachmentFilePath?.split("/").pop() ?? null;
  const recipientRows = inputs ? getRecipientRows(inputs) : [];

  const onApprove = handleSubmit(async ({ subject }) => {
    await onApproveWithEditedArguments({
      editedArguments: { subject },
      approved: neverAskAgain ? "always_approved" : "approved",
    });
  });

  const handleReject = async () => {
    await onApproveWithEditedArguments({
      editedArguments: {},
      approved: "rejected",
    });
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-background shadow-md dark:border-border-night dark:bg-background-night">
      <div className="bg-gray-900 px-4 py-2.5">
        <span className="text-sm font-medium text-white">
          {isReply ? "Reply" : "New Message"}
        </span>
      </div>

      {recipientRows.map(({ label, value }) => (
        <RecipientRow key={label} label={label} value={value} />
      ))}
      <div className="border-b border-border px-4 py-2 dark:border-border-night">
        <input
          {...register("subject")}
          disabled={isSubmitting || isReply}
          placeholder="Subject"
          className="w-full border-none bg-transparent p-0 text-sm text-foreground outline-none focus:ring-0 placeholder:text-muted-foreground disabled:cursor-not-allowed dark:text-foreground-night dark:placeholder:text-muted-foreground-night"
        />
        {errors.subject && (
          <p className="mt-1 text-xs text-warning-800 dark:text-warning-800-night">
            {errors.subject.message}
          </p>
        )}
      </div>

      <div className="h-64 w-full overflow-auto whitespace-pre-wrap break-words px-4 py-3 text-sm text-foreground dark:text-foreground-night">
        {originalBody}
      </div>

      {attachmentName && (
        <div className="px-4 py-2">
          <AttachmentChip label={attachmentName} icon={{ visual: Paperclip }} />
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-border px-4 py-2.5 dark:border-border-night">
        <Button
          label="Send"
          variant="highlight"
          size="sm"
          rounded="full"
          disabled={isSubmitting}
          isPulsing={isPulsing}
          onClick={() => void onApprove()}
        />
        {alwaysAllowLabel && (
          <Label
            htmlFor={`gmail-always-allow-${blockedAction.actionId}`}
            className="flex cursor-pointer flex-row items-center gap-2 text-xs"
          >
            <Checkbox
              id={`gmail-always-allow-${blockedAction.actionId}`}
              checked={neverAskAgain}
              disabled={isSubmitting}
              onCheckedChange={(check) => setNeverAskAgain(!!check)}
            />
            <span className="font-normal">{alwaysAllowLabel}</span>
          </Label>
        )}
        <div className="flex-1" />
        <Button
          tooltip="Discard"
          variant="ghost"
          size="icon"
          icon={Trash01}
          disabled={isSubmitting}
          isPulsing={isPulsing}
          onClick={() => void handleReject()}
        />
      </div>
    </div>
  );
}
