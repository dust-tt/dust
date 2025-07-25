import type { AppContentLayoutProps } from "@app/components/sparkle/AppContentLayout";
import AppContentLayout from "@app/components/sparkle/AppContentLayout";

type AppWideModeLayoutProps = AppContentLayoutProps;

/**
 * A centered layout that wraps AppContentLayout and provides a max-width container
 * for content that should be centered and have a maximum width (like settings pages, etc.).
 *
 * Pages can include their own title components (like AppLayoutSimpleCloseTitle) as the first child.
 */
export function AppWideModeLayout({
  children,
  ...props
}: AppWideModeLayoutProps) {
  return (
    <AppContentLayout hasTitle={false} {...props}>
      <div className="flex h-full w-full flex-col items-center overflow-y-auto pt-8">
        <div className="flex w-full grow flex-col px-4 sm:px-8">{children}</div>
      </div>
    </AppContentLayout>
  );
}
