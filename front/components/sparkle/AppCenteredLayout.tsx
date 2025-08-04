import { cn } from "@dust-tt/sparkle";

import type { AppContentLayoutProps } from "@app/components/sparkle/AppContentLayout";
import AppContentLayout from "@app/components/sparkle/AppContentLayout";

type AppCenteredLayoutProps = AppContentLayoutProps & {
  title?: React.ReactNode;
};

/**
 * A centered layout that wraps AppContentLayout and provides a max-width container
 * for content that should be centered and have a maximum width (like settings pages, etc.).
 *
 * Pages can include their own title components (like AppLayoutSimpleCloseTitle) as the first child.
 */
export function AppCenteredLayout({
  children,
  title,
  ...props
}: AppCenteredLayoutProps) {
  return (
    <AppContentLayout hasTitle={!!title} {...props}>
      {title && title}
      <div
        className={cn(
          "flex w-full flex-col items-center overflow-y-auto pt-4",
          title ? "h-[calc(100vh-3.5rem)]" : "h-full"
        )}
      >
        <div className="flex w-full max-w-4xl grow flex-col px-4 sm:px-8">
          {children}
        </div>
      </div>
    </AppContentLayout>
  );
}
