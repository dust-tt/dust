import type {
  ChartLegendAlignment,
  LegendItem,
} from "@app/components/charts/ChartLegend";
import { ChartLegend } from "@app/components/charts/ChartLegend";
import { CHART_HEIGHT } from "@app/components/charts/constants";
import {
  Button,
  cn,
  Maximize01,
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

interface ChartContainerProps {
  title?: ReactNode;
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
  legendAlignment?: ChartLegendAlignment;
  isAllowFullScreen?: boolean;
  showHeaderDivider?: boolean;
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
  legendAlignment,
  isAllowFullScreen,
  showHeaderDivider,
}: ChartContainerProps) {
  const message = isLoading ? null : (errorMessage ?? emptyMessage);
  const [isFullscreen, setIsFullscreen] = useState(false);
  return (
    <>
      <div className="observability-chart-container rounded-lg border border-border bg-background p-4">
        <div
          className={cn(
            "flex items-center justify-between",
            showHeaderDivider && "border-b border-border pb-3"
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-2">
            {title && (
              <h3 className="text-base font-medium text-foreground">{title}</h3>
            )}
            {statusChip}
          </div>
          <div className="flex items-center gap-3">
            {additionalControls}
            {isAllowFullScreen && (
              <Button
                icon={Maximize01}
                variant="ghost"
                size="xs"
                onClick={() => setIsFullscreen(true)}
                tooltip="View fullscreen"
              />
            )}
          </div>
        </div>
        {description && (
          <div className="mb-3 text-xs text-muted-foreground">
            {description}
          </div>
        )}
        {isLoading || message ? (
          <div
            className={cn(
              "flex items-center justify-center",
              showHeaderDivider && "mt-3"
            )}
            style={{ height: height ?? CHART_HEIGHT }}
          >
            {isLoading ? (
              <Spinner size="lg" />
            ) : (
              <span className="text-sm text-muted-foreground">{message}</span>
            )}
          </div>
        ) : (
          <>
            <ResponsiveContainer
              className={cn(showHeaderDivider && "mt-3")}
              width="100%"
              height={height}
            >
              {children}
            </ResponsiveContainer>
            {bottomControls}
            {legendItems && (
              <ChartLegend items={legendItems} alignment={legendAlignment} />
            )}
          </>
        )}
      </div>
      {isAllowFullScreen && (
        <Sheet open={isFullscreen} onOpenChange={setIsFullscreen}>
          <SheetContent
            size="xl"
            className="observability-chart-container max-w-[75%]"
          >
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
                    height={
                      typeof window !== "undefined"
                        ? window.innerHeight - 250
                        : undefined
                    }
                  >
                    {children}
                  </ResponsiveContainer>
                  {bottomControls}
                  {legendItems && (
                    <ChartLegend
                      items={legendItems}
                      alignment={legendAlignment}
                    />
                  )}
                </div>
              </div>
            </SheetContainer>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
