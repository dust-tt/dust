import { FrameSharingRow } from "@app/components/assistant/conversation/interactive_content/frame/FrameSharingRow";
import { Section } from "@app/components/assistant/conversation/interactive_content/frame/ShareFrameSection";
import { useAwaitableDialog } from "@app/hooks/useAwaitableDialog";
import { MAX_EMAILS_OR_DOMAINS_PER_INVITE } from "@app/types/files";
import type {
  FileSharingGrantType,
  SharingGrantsResponse,
} from "@app/types/sharing_grants";
import {
  addSharingGrantsSchema,
  sharingDomainSchema,
  sharingEmailSchema,
} from "@app/types/sharing_grants";
import { Button, Globe01, Input, ListGroup, Spinner } from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { intlFormatDistance } from "date-fns";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const recipientsSchema = z
  .string()
  .transform((raw, ctx) => {
    const recipients = raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (
      recipients.length === 0 ||
      recipients.length > MAX_EMAILS_OR_DOMAINS_PER_INVITE
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Add between 1 and ${MAX_EMAILS_OR_DOMAINS_PER_INVITE} email addresses or domains.`,
      });
      return z.NEVER;
    }

    const emails: string[] = [];
    const domains: string[] = [];
    for (const recipient of recipients) {
      const email = sharingEmailSchema.safeParse(recipient);
      if (email.success) {
        emails.push(email.data);
        continue;
      }
      const domain = sharingDomainSchema.safeParse(recipient);
      if (domain.success) {
        domains.push(domain.data);
        continue;
      }
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"${recipient}" is not a valid email address or domain.`,
      });
      return z.NEVER;
    }
    return { emails, domains };
  })
  .pipe(addSharingGrantsSchema);

interface FrameSharingGrantsProps {
  sharing: SharingGrantsResponse | undefined;
  canInviteExternal: boolean;
  canRevoke: boolean;
  showLastViewedAt: boolean;
  isLoading: boolean;
  hasError: boolean;
  onAdd: (
    recipients: z.infer<typeof addSharingGrantsSchema>
  ) => Promise<boolean>;
  onRevoke: (grantId: string) => Promise<boolean>;
  onRetry: () => void;
}

export function FrameSharingGrants({
  sharing,
  canInviteExternal,
  canRevoke,
  showLastViewedAt,
  isLoading,
  hasError,
  onAdd,
  onRevoke,
  onRetry,
}: FrameSharingGrantsProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const canGrantDomains = sharing?.canGrantDomains ?? false;
  const formSchema = z.object({
    recipients: recipientsSchema.superRefine(({ domains }, ctx) => {
      if (!canGrantDomains && domains?.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: canInviteExternal
            ? "Add individual email addresses. Domain sharing is not available."
            : "Only workspace member email addresses can be added.",
        });
      }
    }),
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof formSchema>, unknown, z.output<typeof formSchema>>(
    {
      resolver: zodResolver(formSchema),
      defaultValues: { recipients: "" },
      mode: "onSubmit",
      reValidateMode: "onSubmit",
    }
  );
  const { AwaitableDialog, showDialog } = useAwaitableDialog();
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const grants = [...(sharing?.accessGrants ?? [])].sort(
    (a, b) =>
      Number(!!a.blockedByPolicy) - Number(!!b.blockedByPolicy) ||
      a.target.value.localeCompare(b.target.value)
  );
  const lastViewedAtByEmail = new Map(
    sharing?.grants.map((grant) => [grant.email, grant.lastViewedAt])
  );

  const revoke = async (grant: FileSharingGrantType) => {
    const label =
      grant.target.kind === "domain"
        ? `@${grant.target.value}`
        : grant.target.value;
    const confirmed = await showDialog({
      title: "Remove access rule",
      validateLabel: "Remove",
      validateVariant: "warning",
      cancelLabel: "Cancel",
      children: (
        <p>
          Remove access for <strong>{label}</strong>? People may still have
          access through another invitation, domain or the frame’s general
          access setting.
        </p>
      ),
    });
    if (!confirmed) {
      return;
    }
    setRevokingId(grant.sId);
    try {
      await onRevoke(grant.sId);
    } finally {
      setRevokingId(null);
    }
  };

  const inviteLabel = canGrantDomains
    ? "Add people or domains"
    : canInviteExternal
      ? "Invite by email"
      : "Invite workspace members by email";

  return (
    <div className="flex flex-col gap-4">
      <AwaitableDialog />
      <Section label={inviteLabel}>
        <form
          className="flex flex-col gap-2"
          onSubmit={handleSubmit(async ({ recipients }) => {
            const isAdded = await onAdd(recipients);
            if (isAdded) {
              reset();
            }
          })}
        >
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Input
                id={inputId}
                aria-label={inviteLabel}
                placeholder={
                  canGrantDomains
                    ? "alice@example.com, example.com"
                    : "Add comma separated emails"
                }
                {...register("recipients")}
                isError={!!errors.recipients}
                aria-invalid={!!errors.recipients}
                aria-describedby={errors.recipients ? errorId : undefined}
                disabled={isLoading || hasError || isSubmitting}
              />
            </div>
            <Button
              variant="primary"
              label={canGrantDomains ? "Add" : "Invite"}
              type="submit"
              isLoading={isSubmitting}
              disabled={isLoading || hasError}
            />
          </div>
          {errors.recipients && (
            <p
              id={errorId}
              role="alert"
              className="text-sm text-foreground px-2"
            >
              {errors.recipients.message}
            </p>
          )}
          {canGrantDomains && (
            <p className="text-xs text-muted-foreground">
              Invitations are sent to email addresses only. People at an added
              domain can open the link after verifying their email.
            </p>
          )}
        </form>
      </Section>

      {isLoading ? (
        <div
          role="status"
          aria-label="Loading access rules"
          className="flex justify-center py-4"
        >
          <div aria-hidden="true">
            <Spinner size="sm" />
          </div>
        </div>
      ) : hasError ? (
        <div role="alert" className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Could not load access rules.
          </p>
          <Button label="Retry" variant="outline" onClick={onRetry} />
        </div>
      ) : grants.length === 0 ? (
        <p className="px-2 text-sm text-muted-foreground">
          {canGrantDomains
            ? "No people or domains have been added yet."
            : "No one has been invited yet."}
        </p>
      ) : (
        <Section label="People with access">
          <ListGroup className="border-0">
            <ul>
              {grants.map((grant) => (
                <li key={grant.sId}>
                  <GrantRow
                    grant={grant}
                    lastViewedAt={
                      showLastViewedAt
                        ? (lastViewedAtByEmail.get(grant.target.value) ?? null)
                        : undefined
                    }
                    isRevoking={revokingId === grant.sId}
                    onRevoke={
                      canRevoke && revokingId === null
                        ? () => revoke(grant)
                        : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          </ListGroup>
        </Section>
      )}
    </div>
  );
}

interface GrantRowProps {
  grant: FileSharingGrantType;
  lastViewedAt?: number | null;
  isRevoking: boolean;
  onRevoke?: () => void;
}

function GrantRow({
  grant,
  lastViewedAt,
  isRevoking,
  onRevoke,
}: GrantRowProps) {
  const isDomain = grant.target.kind === "domain";
  const label = isDomain ? `@${grant.target.value}` : grant.target.value;
  const now = new Date();
  const grantedBy = grant.grantedBy?.fullName ?? grant.grantedBy?.email;
  const grantedAgo = intlFormatDistance(new Date(grant.grantedAt), now);
  const action = isDomain ? "Added" : "Invited";
  const grantedLabel = grantedBy
    ? `${action} by ${grantedBy} ${grantedAgo}`
    : `${action} ${grantedAgo}`;
  const viewedLabel = lastViewedAt
    ? `Viewed ${intlFormatDistance(new Date(lastViewedAt), now)}`
    : "Never viewed";
  const description =
    isDomain || lastViewedAt === undefined
      ? grantedLabel
      : `${grantedLabel} · ${viewedLabel}`;

  return (
    <FrameSharingRow
      label={label}
      icon={isDomain ? Globe01 : undefined}
      onRemove={onRevoke}
      isRemoving={isRevoking}
    >
      <span>{description}</span>
      {grant.blockedByPolicy && (
        <span>
          {isDomain
            ? "External viewers cannot access this frame."
            : "This invitation is restricted to workspace members."}
        </span>
      )}
    </FrameSharingRow>
  );
}
