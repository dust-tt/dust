import type { ReactNode } from "react";

interface TabContentLayoutProps {
  title: string;
  headerAction?: ReactNode;
  children: ReactNode;
}

export function TabContentLayout({
  title,
  headerAction,
  children,
}: TabContentLayoutProps) {
  return (
    <section className="flex h-full flex-col gap-6 overflow-y-auto p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground dark:text-foreground-night">
          {title}
        </h2>
        {headerAction}
      </div>
      {children}
    </section>
  );
}
