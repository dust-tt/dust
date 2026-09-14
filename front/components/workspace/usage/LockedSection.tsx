import {
  cn,
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "@dust-tt/sparkle";

interface LockedSectionProps {
  locked: boolean;
  children: React.ReactNode;
  className?: string;
  tooltipContent?: React.ReactNode;
}

export function LockedSection({
  locked,
  children,
  className,
  tooltipContent = "Top up your credit pool to enable these settings",
}: LockedSectionProps) {
  if (!locked) {
    return <>{children}</>;
  }
  return (
    <TooltipProvider delayDuration={300}>
      <TooltipRoot>
        <div className="relative">
          <div
            className={cn(
              "pointer-events-none select-none opacity-40",
              className
            )}
          >
            {children}
          </div>
          <TooltipTrigger asChild>
            <div className="absolute inset-0 cursor-not-allowed" />
          </TooltipTrigger>
        </div>
        <TooltipContent>{tooltipContent}</TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  );
}
