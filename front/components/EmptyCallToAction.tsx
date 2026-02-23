import { classNames } from "@app/lib/utils";
import { Button, LinkWrapper } from "@dust-tt/sparkle";
import type { ComponentType, MouseEvent } from "react";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React from "react";

export function EmptyCallToAction({
  label,
  disabled = false,
  icon,
  href,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  icon?: ComponentType;
  href?: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const button = (
    <Button
      disabled={disabled}
      size="sm"
      label={label}
      variant="primary"
      icon={icon}
      onClick={onClick}
    />
  );
  return (
    <div
      className={classNames(
        "flex h-36 w-full items-center justify-center rounded-xl",
        "bg-muted-background dark:bg-muted-background-night"
      )}
    >
      {href ? <LinkWrapper href={href}>{button}</LinkWrapper> : button}
    </div>
  );
}
