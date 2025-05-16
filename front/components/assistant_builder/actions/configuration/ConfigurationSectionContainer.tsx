import { cn } from "@dust-tt/sparkle";

interface ConfigurationSectionContainerProps {
  title: string;
  description?: string | React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function ConfigurationSectionContainer({
  title,
  description,
  children,
  className,
}: ConfigurationSectionContainerProps) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className={cn(description && "flex flex-col gap-2")}>
        <h3 className="heading-base font-semibold text-foreground dark:text-foreground-night">
          {title}
        </h3>
        {description && (
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            {description}
          </p>
        )}
      </div>

      <div>{children}</div>
    </div>
  );
}
