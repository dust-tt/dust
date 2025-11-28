import type { ReactNode } from "react";

interface TabContentLayoutProps {
  title: string;
  headerAction?: ReactNode;
  children: ReactNode;
}

export function TabContentChildSectionLayout({
  title,
  headerAction,
  children,
}: TabContentLayoutProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground dark:text-foreground-night">
          {title}
        </h3>
        {headerAction}
      </div>
      {children}
    </div>
  );
}
