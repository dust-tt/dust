import { getCollapseAnimationStyle } from "@app/components/assistant/conversation/actions/inline/utils";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import {
  formatCalendarDate,
  getCalendarDay,
} from "@app/lib/client/calendar_date";
import { formatTime } from "@app/lib/i18n/format";
import type { LightAgentMessageType } from "@app/types/assistant/conversation";
import {
  frameSlideshowContentType,
  isFrameContentType,
} from "@app/types/files";
import {
  ActionFrame,
  ChevronRight,
  Citation,
  CitationDescription,
  CitationGrid,
  CitationTitle,
  cn,
  Icon,
} from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg, select } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

const FILE_TIME_OPTIONS = {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
} as const;

function getDescriptionForContentType(
  file: LightAgentMessageType["generatedFiles"][number]
) {
  if (file.contentType === frameSlideshowContentType) {
    return msg`Presentation`;
  }

  if (isFrameContentType(file.contentType)) {
    return msg`Frames`;
  }

  return null;
}

function formatUpdatedLabel(
  updatedAt: Date | number,
  t: (descriptor: MessageDescriptor) => string
): string {
  const calendarDay = getCalendarDay(updatedAt);
  if (!calendarDay) {
    return formatCalendarDate(updatedAt, t);
  }

  const { kind: updatedDayKind, day: updatedDay } = calendarDay;
  return t(
    msg`${select(updatedDayKind, {
      relative: `Updated ${updatedDay}`,
      lastWeekday: `Updated last ${updatedDay}`,
      weekday: `Updated on ${updatedDay}`,
      other: `Updated on ${updatedDay}`,
    })}`
  );
}

interface AgentMessageInteractiveContentGeneratedFilesProps {
  files: LightAgentMessageType["generatedFiles"];
  onClick?: () => void;
  variant?: "list" | "grid";
  collapsible?: boolean;
}

export function AgentMessageInteractiveContentGeneratedFiles({
  files,
  onClick,
  variant = "list",
  collapsible = false,
}: AgentMessageInteractiveContentGeneratedFilesProps) {
  const { t } = useLingui();
  const { openPanel } = useConversationSidePanelContext();
  const [isCollapsed, setIsCollapsed] = useState(collapsible);

  if (files.length === 0) {
    return null;
  }

  const grid = (
    <CitationGrid variant={variant}>
      {files.map((file) => {
        if (!file.fileId) {
          return null;
        }

        const { fileId } = file;
        const handleClick = (e: React.MouseEvent) => {
          e.preventDefault();
          openPanel({
            type: "interactive_content",
            fileId,
          });
          onClick?.();
        };

        const descriptionDescriptor = getDescriptionForContentType(file);
        const description = descriptionDescriptor
          ? t(descriptionDescriptor)
          : null;
        const updatedLabel = file.updatedAt
          ? formatUpdatedLabel(file.updatedAt, t)
          : null;

        return (
          <Citation
            key={fileId}
            tooltip={file.title}
            onClick={handleClick}
            className="bg-primary-50"
          >
            <div className="flex flex-row items-center">
              <CitationTitle>{file.title}</CitationTitle>
            </div>
            <CitationDescription>
              <div className="flow-row flex items-center gap-2">
                {variant === "grid" && (file.updatedAt ?? file.createdAt) && (
                  <div>
                    {file.updatedAt && file.updatedAt !== file.createdAt ? (
                      <>
                        <span>{updatedLabel}</span>
                        <span className="mx-1">{"\u00B7"}</span>
                        <time>
                          {formatTime(file.updatedAt, FILE_TIME_OPTIONS)}
                        </time>
                      </>
                    ) : file.createdAt ? (
                      <>
                        <span>{formatCalendarDate(file.createdAt, t)}</span>
                        <span className="mx-1">{"\u00B7"}</span>
                        <time>
                          {formatTime(file.createdAt, FILE_TIME_OPTIONS)}
                        </time>
                      </>
                    ) : null}
                  </div>
                )}
                {variant === "list" && description && (
                  <p className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Icon visual={ActionFrame} size="xs" />
                    {description}
                  </p>
                )}
              </div>
            </CitationDescription>
          </Citation>
        );
      })}
    </CitationGrid>
  );

  if (!collapsible) {
    return grid;
  }

  return (
    <div className="flex flex-col text-sm">
      <button
        type="button"
        className="self-start text-muted-foreground hover:text-foreground transition-colors duration-200 flex gap-1 items-center"
        onClick={() => setIsCollapsed((c) => !c)}
      >
        <Trans>Frames</Trans>
        <span
          className={cn(
            "transition-transform duration-200 ease-out",
            isCollapsed ? "rotate-0" : "rotate-90"
          )}
        >
          <Icon size="xs" visual={ChevronRight} />
        </span>
      </button>
      <div
        className="grid ease-out"
        style={getCollapseAnimationStyle(isCollapsed)}
      >
        <div className="overflow-hidden">{grid}</div>
      </div>
    </div>
  );
}
