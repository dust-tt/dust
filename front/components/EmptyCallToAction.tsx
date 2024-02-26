import { Button } from "@dust-tt/sparkle";
import Link from "next/link";
import type { ComponentType, MouseEvent } from "react";
import React from "react";

import { classNames } from "@app/lib/utils";

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
        "flex h-full min-h-40 items-center justify-center rounded-lg bg-structure-50"
      )}
    >
      {href ? <Link href={href}>{button}</Link> : button}
    </div>
  );
}
