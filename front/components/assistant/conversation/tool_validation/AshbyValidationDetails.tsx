import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  LinkExternal01,
} from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";

function formatFieldValue(
  value: string | number | boolean,
  t: (descriptor: MessageDescriptor) => string
): string {
  if (typeof value === "boolean") {
    return value ? t(msg`Yes`) : t(msg`No`);
  }
  return String(value);
}

interface DisplayableInput {
  label: string;
  value: string;
}

interface AshbyReferralDetailsProps {
  fieldSubmissions: ReadonlyArray<{
    title: string;
    value: string | number | boolean;
  }>;
  userEmail: string;
}

interface AshbyJobPostingUpdateDetailsProps {
  jobPostingId: string;
  jobId: string;
  title?: string;
  descriptionHtml?: string;
  workplaceType?: string | null;
}

export function AshbyJobPostingUpdateDetails({
  jobPostingId,
  jobId,
  title,
  descriptionHtml,
  workplaceType,
}: AshbyJobPostingUpdateDetailsProps) {
  const { t } = useLingui();
  const jobPostingUrl = `https://app.ashbyhq.com/jobs/${jobId}/job-postings/${jobPostingId}/description`;

  const fields: DisplayableInput[] = [];

  if (title) {
    fields.push({ label: t`New title`, value: title });
  }
  if (workplaceType) {
    fields.push({ label: t`Workplace type`, value: workplaceType });
  }

  return (
    <div className="flex flex-col gap-3 pt-2">
      <p className="text-sm text-muted-foreground">
        <Trans>
          This will update the job posting on Ashby. Changes are applied
          immediately and visible to candidates.
        </Trans>
      </p>

      <Button
        variant="outline"
        size="xs"
        label={t`View on Ashby`}
        icon={LinkExternal01}
        href={jobPostingUrl}
        target="_blank"
      />

      {fields.map(({ label, value }) => (
        <div key={label}>
          <div className="text-xs font-medium text-muted-foreground">
            {label}
          </div>
          <div className="mt-0.5 text-sm text-foreground">{value}</div>
        </div>
      ))}

      {descriptionHtml && (
        <Collapsible>
          <CollapsibleTrigger>
            <span className="text-sm font-medium">
              <Trans>New description</Trans>
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted px-3 text-sm">
              {descriptionHtml.replace(/<(?!\/)/g, "\n<")}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

export function AshbyReferralDetails({
  fieldSubmissions,
  userEmail,
}: AshbyReferralDetailsProps) {
  const { t } = useLingui();

  return (
    <div className="flex flex-col gap-3 pt-2">
      <p className="text-sm text-muted-foreground">
        {/* Safe to show: this component only renders for users authorized to
            respond (canCurrentUserRespond guard in parent). */}
        <Trans>
          The referral will be credited to&nbsp;
          <span className="font-medium text-foreground">{userEmail}</span>.
        </Trans>
      </p>

      <div className="divide-y divide-separator overflow-hidden rounded-xl bg-background">
        {fieldSubmissions.map(({ title, value }) => {
          const displayValue = formatFieldValue(value, t);

          if (!displayValue) {
            return null;
          }

          return (
            <div key={title} className="px-3 py-2">
              <div className="text-xs font-medium text-muted-foreground">
                {title}
              </div>
              <div className="mt-0.5 text-sm text-foreground">
                {displayValue}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
