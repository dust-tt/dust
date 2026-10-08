import {
  API_KEY_STATUS_CHIP_COLORS,
  API_KEY_STATUS_LABELS,
  getKeyScopeLabel,
  getKeyStatus,
} from "@app/components/workspace/api-keys/utils";
import { formatCredits } from "@app/lib/client/credits";
import { timeAgoFrom } from "@app/lib/client/relative_time";
import { formatDate } from "@app/lib/i18n/format";
import type { KeyType } from "@app/types/key";
import {
  Chip,
  Label,
  LoadingBlock,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

interface APIKeyDetailsSheetProps {
  // The key to show; the sheet is closed when null.
  apiKey: KeyType | null;
  onClose: () => void;
  // Formatted monthly cap, null when unlimited.
  monthlyCap: string | null;
  monthlyCapLabel: string;
  // Credits used over the selected period, null when unknown. Shown only with
  // `showAnalyticsConsumption`.
  credits: number | null;
  isCreditsLoading: boolean;
  showAnalyticsConsumption: boolean;
}

interface DetailsSectionProps {
  title: string;
  children: ReactNode;
}

function DetailsSection({ title, children }: DetailsSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{title}</Label>
      {children}
    </div>
  );
}

interface DescriptionProps {
  children: ReactNode;
}

function Description({ children }: DescriptionProps) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

interface NameChipsProps {
  items: { sId: string; name: string }[];
}

function NameChips({ items }: NameChipsProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <Chip key={item.sId} size="xs" label={item.name} />
      ))}
    </div>
  );
}

export function APIKeyDetailsSheet({
  apiKey,
  onClose,
  monthlyCap,
  monthlyCapLabel,
  credits,
  isCreditsLoading,
  showAnalyticsConsumption,
}: APIKeyDetailsSheetProps) {
  const { t } = useLingui();

  return (
    <Sheet
      open={apiKey !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent size="lg">
        {apiKey && (
          <APIKeyDetails
            apiKey={apiKey}
            monthlyCap={monthlyCap}
            monthlyCapLabel={monthlyCapLabel}
            credits={credits}
            isCreditsLoading={isCreditsLoading}
            showAnalyticsConsumption={showAnalyticsConsumption}
          />
        )}
        <SheetFooter
          leftButtonProps={{
            label: t`Close`,
            variant: "outline",
            onClick: onClose,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

interface APIKeyDetailsProps extends Omit<
  APIKeyDetailsSheetProps,
  "apiKey" | "onClose"
> {
  apiKey: KeyType;
}

function APIKeyDetails({
  apiKey,
  monthlyCap,
  monthlyCapLabel,
  credits,
  isCreditsLoading,
  showAnalyticsConsumption,
}: APIKeyDetailsProps) {
  const { t } = useLingui();
  const status = getKeyStatus(apiKey);
  const isAdmin = apiKey.role === "admin";
  const createdOn = formatDate(apiKey.createdAt, { dateStyle: "long" });
  const creator = apiKey.creator ?? t`Unknown creator`;
  const name = apiKey.name || t`Unnamed`;

  return (
    <>
      <SheetHeader>
        <SheetTitle className="dd-privacy-mask">{name}</SheetTitle>
      </SheetHeader>
      <SheetContainer>
        <div className="dd-privacy-mask space-y-4">
          <DetailsSection title={t`Status`}>
            <div>
              <Chip
                size="xs"
                color={API_KEY_STATUS_CHIP_COLORS[status]}
                label={t(API_KEY_STATUS_LABELS[status])}
              />
            </div>
          </DetailsSection>

          <DetailsSection title={t`Key`}>
            <p className="font-mono text-sm text-muted-foreground">
              {apiKey.secret}
            </p>
          </DetailsSection>

          <DetailsSection
            title={t({
              message: "Created",
              context: "API key details section, creation date",
            })}
          >
            <Description>
              <Trans>
                {createdOn} by {creator}
              </Trans>
            </Description>
          </DetailsSection>

          <DetailsSection title={t`Last used`}>
            <Description>
              {apiKey.lastUsedAt
                ? timeAgoFrom(apiKey.lastUsedAt, { useLongFormat: true })
                : t`Never`}
            </Description>
          </DetailsSection>

          <DetailsSection title={t`Spaces`}>
            <Description>
              <Trans>
                The key can read everything workspace members can, including
                open spaces and Company Data. It can read and write in the
                spaces below.
              </Trans>
            </Description>
            {apiKey.spaces.length > 0 ? (
              <NameChips items={apiKey.spaces} />
            ) : (
              <Description>
                <Trans>No spaces</Trans>
              </Description>
            )}
          </DetailsSection>

          <DetailsSection title={t`Access scope`}>
            <div>
              <Chip
                size="xs"
                color={isAdmin ? "warning" : "primary"}
                label={t(getKeyScopeLabel(apiKey.role))}
              />
            </div>
            <Description>
              {isAdmin
                ? t`Create and modify resources plus workspace administration (members, analytics export)`
                : t`Can create conversations, read agents and data sources.`}
            </Description>
          </DetailsSection>

          <DetailsSection title={monthlyCapLabel}>
            <Description>{monthlyCap ?? t`Unlimited`}</Description>
          </DetailsSection>

          {showAnalyticsConsumption && (
            <DetailsSection title={t`Credits used`}>
              {isCreditsLoading ? (
                <LoadingBlock className="h-3 w-16" />
              ) : (
                <Description>
                  {credits === null ? "—" : formatCredits(credits)}
                </Description>
              )}
            </DetailsSection>
          )}
        </div>
      </SheetContainer>
    </>
  );
}
