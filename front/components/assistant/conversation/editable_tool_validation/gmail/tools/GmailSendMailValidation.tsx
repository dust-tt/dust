import type { EditableToolValidationComponentProps } from "@app/components/assistant/conversation/editable_tool_validation/types";
import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import type { GmailSendMailInput } from "@app/lib/api/actions/servers/gmail/types";
import { isGmailSendMailInput } from "@app/lib/api/actions/servers/gmail/types";
import {
  AttachmentChip,
  Button,
  Check,
  CheckDouble,
  InfoCircle,
  Paperclip,
  XClose,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

interface ComposeFormValues {
  subject: string;
  body: string;
}

function getComposeFormSchema({
  isSubjectEditable,
  isBodyEditable,
}: {
  isSubjectEditable: boolean;
  isBodyEditable: boolean;
}) {
  return z.object({
    subject: isSubjectEditable
      ? z.string().trim().min(1, "Subject is required.")
      : z.string(),
    body: isBodyEditable
      ? z.string().trim().min(1, "Body is required.")
      : z.string(),
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
    <div className="flex gap-2 border-b border-border px-4 py-2">
      <span className="shrink-0 text-sm text-faint">{label}</span>
      <span className="wrap-break-word text-sm text-muted-foreground">
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
  const inputs = useMemo(
    () =>
      isGmailSendMailInput(blockedAction.inputs) ? blockedAction.inputs : null,
    [blockedAction.inputs]
  );

  const originalSubject = inputs?.subject ?? "";
  const originalBody = inputs?.body ?? "";
  const isReply = !!inputs?.replyToMessageId;

  const { editableArguments } = blockedAction;
  const isSubjectEditable =
    !isReply && !!editableArguments?.includes("subject");
  const isBodyEditable = !!editableArguments?.includes("body");

  const formSchema = useMemo(
    () => getComposeFormSchema({ isSubjectEditable, isBodyEditable }),
    [isSubjectEditable, isBodyEditable]
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ComposeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { subject: originalSubject, body: originalBody },
    mode: "onChange",
  });

  const attachmentName = inputs?.attachmentFilePath?.split("/").pop() ?? null;
  const recipientRows = inputs ? getRecipientRows(inputs) : [];

  const onApprove = (approved: MCPValidationOutputType) =>
    handleSubmit(async ({ subject, body }) => {
      await onApproveWithEditedArguments({
        editedArguments: {
          ...(isSubjectEditable && { subject }),
          ...(isBodyEditable && { body }),
        },
        approved,
      });
    })();

  const handleReject = async () => {
    await onApproveWithEditedArguments({
      editedArguments: {},
      approved: "rejected",
    });
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-background shadow-md">
      <div className="bg-gray-900 px-4 py-2.5">
        <span className="text-sm font-medium text-white">
          {isReply ? "Reply" : "New Message"}
        </span>
      </div>

      {recipientRows.map(({ label, value }) => (
        <RecipientRow key={label} label={label} value={value} />
      ))}

      {isSubjectEditable ? (
        <div className="border-b border-border px-4 py-2">
          <input
            {...register("subject")}
            disabled={isSubmitting}
            placeholder="Subject"
            className="w-full border-none bg-transparent p-0 text-sm text-foreground outline-none focus:ring-0 placeholder:text-faint disabled:cursor-not-allowed"
          />
          {errors.subject && (
            <p className="mt-1 text-xs text-warning-800">
              {errors.subject.message}
            </p>
          )}
        </div>
      ) : (
        <div className="border-b border-border px-4 py-2 text-sm text-muted-foreground">
          {isReply ? "Kept from the original message" : originalSubject}
        </div>
      )}

      {isBodyEditable ? (
        <div className="px-4 py-3">
          <textarea
            {...register("body")}
            disabled={isSubmitting}
            placeholder="Body"
            className="h-64 w-full resize-none border-none bg-transparent p-0 text-sm text-foreground outline-none focus:ring-0 placeholder:text-faint disabled:cursor-not-allowed"
          />
          {errors.body && (
            <p className="mt-1 text-xs text-warning-800">
              {errors.body.message}
            </p>
          )}
        </div>
      ) : (
        <div className="whitespace-pre-wrap px-4 py-3 text-sm text-muted-foreground">
          {originalBody}
        </div>
      )}

      {attachmentName && (
        <div className="px-4 py-2">
          <AttachmentChip label={attachmentName} icon={{ visual: Paperclip }} />
        </div>
      )}

      <div className="flex flex-col gap-4 border-t border-border px-4 py-2.5">
        {blockedAction.stake === "medium" && alwaysAllowLabel && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <InfoCircle className="h-4 w-4 shrink-0" />
            <span>{alwaysAllowLabel}</span>
          </div>
        )}
        <div className="flex items-center gap-3">
          <Button
            label="Decline"
            variant="outline"
            size="sm"
            icon={XClose}
            isRounded
            disabled={isSubmitting}
            onClick={() => void handleReject()}
          />
          <div className="flex-1" />
          <Button
            label={alwaysAllowLabel ? "Allow once" : "Allow"}
            variant="highlight"
            size="sm"
            icon={Check}
            isRounded
            disabled={isSubmitting}
            isPulsing={isPulsing}
            onClick={() => void onApprove("approved")}
          />
          {alwaysAllowLabel && (
            <Button
              label="Always allow"
              variant="highlight"
              size="sm"
              icon={CheckDouble}
              isRounded
              disabled={isSubmitting}
              onClick={() => void onApprove("always_approved")}
            />
          )}
        </div>
      </div>
    </div>
  );
}
