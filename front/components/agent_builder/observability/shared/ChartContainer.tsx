import {
  Button,
  FullscreenIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@dust-tt/sparkle";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { ResponsiveContainer } from "recharts";

import { CHART_HEIGHT } from "@app/components/agent_builder/observability/constants";

import type { LegendItem } from "./ChartLegend";
import { ChartLegend } from "./ChartLegend";

interface ChartContainerProps {
  title: ReactNode;
  isLoading: boolean;
  errorMessage?: string;
  emptyMessage?: string;
  children: ReactElement;
  additionalControls?: ReactNode;
  bottomControls?: ReactNode;
  statusChip?: ReactNode;
  height?: number;
  description?: string;
  legendItems?: LegendItem[];
  isAllowFullScreen?: boolean;
}

export function ChartContainer({
  title,
  isLoading,
  errorMessage,
  emptyMessage,
  children,
  additionalControls,
  bottomControls,
  statusChip,
  height,
  description,
  legendItems,
  isAllowFullScreen,
}: ChartContainerProps) {
  const message = isLoading ? null : (errorMessage ?? emptyMessage);
  const [isFullscreen, setIsFullscreen] = useState(false);
  return (
    <>
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-medium text-foreground dark:text-foreground-night">
              {title}
            </h3>
            {statusChip}
          </div>
          <div className="flex items-center gap-3">
            {additionalControls}
            {isAllowFullScreen && (
              <Button
                icon={FullscreenIcon}
                variant="ghost"
                size="xs"
                onClick={() => setIsFullscreen(true)}
                tooltip="View fullscreen"
              />
            )}
          </div>
        </div>
        {description && (
          <div className="my-3 text-xs text-muted-foreground dark:text-muted-foreground-night">
            {description}
          </div>
        )}
        {isLoading || message ? (
          <div
            className="flex items-center justify-center"
            style={{ height: CHART_HEIGHT }}
          >
            {isLoading ? (
              <Spinner size="lg" />
            ) : (
              <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                {message}
              </span>
            )}
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={height}>
              {children}
            </ResponsiveContainer>
            {bottomControls}
            {legendItems && <ChartLegend items={legendItems} />}
          </>
        )}
      </div>
      {isAllowFullScreen && isFullscreen && (
        <Sheet open={isFullscreen} onOpenChange={setIsFullscreen}>
          <SheetContent size="xl" className="max-w-[75%]">
            <SheetHeader>
              <SheetTitle>{title}</SheetTitle>
            </SheetHeader>
            <SheetContainer>
              <div className="flex h-full flex-col">
                <div className="mb-4 flex items-center justify-between border-b pb-4">
                  {additionalControls}
                </div>
                <div className="flex-1 overflow-hidden">
                  <ResponsiveContainer
                    width="100%"
                    height={window.innerHeight - 250}
                  >
                    {children}
                  </ResponsiveContainer>
                  {bottomControls}
                  {legendItems && <ChartLegend items={legendItems} />}
                </div>
              </div>
            </SheetContainer>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
