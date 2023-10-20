import React from "react";

import { classNames } from "@app/lib/utils";

interface ContentSectionProps {
  children: React.ReactNode;
  isWide?: boolean;
}

const styles = {
  base: "container",
  narrow: "sm:max-w-3xl lg:max-w-5xl xl:max-w-7xl",
  wide: "sm:max-w-5xl lg:max-w-7xl xl:max-w-8xl",
};

export function ContentSection({
  children,
  isWide = false,
}: ContentSectionProps) {
  return (
    <div
      className={classNames(styles.base, isWide ? styles.wide : styles.narrow)}
    >
      {children}
    </div>
  );
}
