import { getModelLogoByModelId } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import {
  formatCreditPerMessageValue,
  formatCreditsCompact,
  formatCreditValue,
} from "@app/lib/client/credits";
import { formatNumber } from "@app/lib/i18n/format";
import {
  Avatar,
  DustLogoSquare,
  Icon,
  ProgressBar,
  Tooltip,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import type { ComponentProps, ReactNode } from "react";

interface AvatarNameCellProps {
  name: string;
  imageUrl: string | null;
  isRounded?: boolean;
  size?: ComponentProps<typeof Avatar>["size"];
}

export function AvatarNameCell({
  name,
  imageUrl,
  isRounded,
  size = "xs",
}: AvatarNameCellProps) {
  return (
    <div className="flex items-center gap-2">
      <Avatar
        name={name}
        visual={imageUrl ?? undefined}
        size={size}
        isRounded={isRounded}
      />
      <span className="truncate text-sm">{name}</span>
    </div>
  );
}

interface EntityTooltipCardProps {
  avatar: ReactNode;
  name: string;
  description: string | null;
  modelId?: string | null;
  modelDisplayName?: string | null;
}

export function EntityTooltipCard({
  avatar,
  name,
  description,
  modelId,
  modelDisplayName,
}: EntityTooltipCardProps) {
  const { isDark } = useTheme();
  const ModelLogo = modelId
    ? getModelLogoByModelId(modelId, isDark)
    : undefined;

  return (
    <div className="flex w-64 flex-col gap-3 py-1 text-left">
      <div className="flex min-w-0 items-center gap-2">
        {avatar}
        <span className="truncate text-base font-semibold text-primary-50">
          {name}
        </span>
      </div>
      <span className="text-sm leading-5 text-primary-200">{description}</span>
      {modelDisplayName && (
        <div className="flex items-center gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-primary-50">
            <Icon
              visual={ModelLogo ?? DustLogoSquare}
              size="xs"
              className="text-primary-950"
            />
          </span>
          <span className="text-sm font-medium text-primary-50">
            {modelDisplayName}
          </span>
        </div>
      )}
    </div>
  );
}

export function CostShareCell({ share }: { share: number }) {
  const percentage = Math.round(Math.min(100, share * 100));

  return (
    <div className="flex items-center gap-2">
      <ProgressBar className="w-24" percentage={percentage} />
      <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">
        {formatNumber(percentage / 100, { style: "percent" })}
      </span>
    </div>
  );
}

export function CreditsCell({
  credits,
  messageCount,
}: {
  credits: number;
  // When provided (and > 0), the tooltip also shows the average cost per
  // message (credits / messageCount).
  messageCount?: number;
}) {
  const { t } = useLingui();
  const showAvg = messageCount !== undefined && messageCount > 0;
  const averageCredits = showAvg
    ? formatCreditPerMessageValue(credits / messageCount, t)
    : null;
  return (
    <Tooltip
      label={
        <div className="flex flex-col">
          <span>{formatCreditValue(credits, t)}</span>
          {showAvg && <span>{averageCredits}</span>}
        </div>
      }
      tooltipTriggerAsChild
      trigger={<span className="text-sm">{formatCreditsCompact(credits)}</span>}
    />
  );
}
