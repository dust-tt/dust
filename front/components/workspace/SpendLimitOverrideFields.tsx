import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { formatShortDate } from "@app/lib/utils/timestamps";
import type { SpendLimitExpiryKind } from "@app/types/api/users/spend_limit";
import { SPEND_LIMIT_EXPIRY_KINDS } from "@app/types/api/users/spend_limit";
import {
  ContentMessage,
  Input,
  RadioGroup,
  RadioGroupItem,
} from "@dust-tt/sparkle";
import type { Control } from "react-hook-form";
import { useController } from "react-hook-form";
import { z } from "zod";

export const MIN_AWU_CREDITS = 0;
export const MAX_AWU_CREDITS = 2_000_000;

function isSpendLimitExpiryKind(value: string): value is SpendLimitExpiryKind {
  return (SPEND_LIMIT_EXPIRY_KINDS as readonly string[]).includes(value);
}

export const spendLimitOverrideFormSchema = z
  .object({
    creditsInput: z.string(),
    expiryMode: z.enum(SPEND_LIMIT_EXPIRY_KINDS),
  })
  .superRefine((data, ctx) => {
    const parsed = Number(data.creditsInput);
    if (!Number.isInteger(parsed) || parsed < MIN_AWU_CREDITS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["creditsInput"],
        message: `Enter a whole number of credits between ${MIN_AWU_CREDITS.toLocaleString("en-US")} and ${MAX_AWU_CREDITS.toLocaleString("en-US")}.`,
      });
      return;
    }
    if (parsed > MAX_AWU_CREDITS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["creditsInput"],
        message: `Credits cannot exceed ${MAX_AWU_CREDITS.toLocaleString("en-US")}.`,
      });
    }
  });

export type SpendLimitOverrideFormValues = z.infer<
  typeof spendLimitOverrideFormSchema
>;

interface SpendLimitOverrideFieldsProps {
  control: Control<SpendLimitOverrideFormValues>;
  member: MemberUsageType | null;
  currentAwuCredits: number | null;
  nextCreditResetAt: number | null;
}

export function SpendLimitOverrideFields({
  control,
  member,
  currentAwuCredits,
  nextCreditResetAt,
}: SpendLimitOverrideFieldsProps) {
  const { field: creditsField, fieldState: creditsFieldState } = useController({
    name: "creditsInput",
    control,
  });
  const { field: expiryField } = useController({ name: "expiryMode", control });

  const parsedCreditsInput = Number(creditsField.value);
  const showsLoweringWarning =
    currentAwuCredits !== null &&
    creditsField.value.length > 0 &&
    Number.isInteger(parsedCreditsInput) &&
    parsedCreditsInput < currentAwuCredits;

  return (
    <div className="flex flex-col gap-1.5 pl-6">
      <Input
        id="spend-credit-limit-input"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="1,000"
        value={
          creditsField.value !== ""
            ? Number(creditsField.value).toLocaleString()
            : ""
        }
        onChange={(e) =>
          // Keep only digits — credits are integers and the API range starts at 0.
          creditsField.onChange(e.target.value.replace(/[^\d]/g, ""))
        }
        isError={creditsFieldState.error !== undefined}
        message={creditsFieldState.error?.message}
        messageStatus={creditsFieldState.error ? "error" : undefined}
        className="text-right"
        suffix="credits/month"
      />
      {member && (
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-muted-foreground">
            Current allowed overage:&nbsp;
            {(currentAwuCredits ?? 0).toLocaleString("en-US")} credits
          </p>
          <p className="text-xs text-muted-foreground">
            Current overage consumption:&nbsp;
            {member.consumedFromPoolAwuCredits.toLocaleString("en-US")}
            &nbsp;credits
          </p>
        </div>
      )}
      {showsLoweringWarning && (
        <ContentMessage
          size="sm"
          variant="golden"
          title="This lowers the member's limit"
        >
          <p>Won&apos;t unblock them until usage drops below the new limit.</p>
        </ContentMessage>
      )}
      <div className="flex flex-col gap-1.5 pt-2">
        <span className="text-sm font-medium">Expires</span>
        <RadioGroup
          value={expiryField.value}
          onValueChange={(v) => {
            if (isSpendLimitExpiryKind(v)) {
              expiryField.onChange(v);
            }
          }}
          className="flex flex-col gap-2"
        >
          <RadioGroupItem
            value="one_day"
            id="spend-limit-expiry-one-day"
            label="In 1 day"
          />
          {nextCreditResetAt && (
            <RadioGroupItem
              value="next_credit_reset"
              id="spend-limit-expiry-next-credit-reset"
              label={`At next credit refresh (${formatShortDate(nextCreditResetAt, { includeYear: true, timeZone: "UTC" })})`}
            />
          )}
          <RadioGroupItem
            value="never"
            id="spend-limit-expiry-never"
            label="Never"
          />
        </RadioGroup>
      </div>
    </div>
  );
}
