import type { SparkleLinkProps } from "@dust-tt/sparkle";
import Link from "next/link";

export function NextLinkWrapper({
  href,
  children,
  replace = false,
  shallow = false,
  target = "_self",
  ...props
}: SparkleLinkProps) {
  return (
    <Link
      href={href}
      target={target}
      shallow={shallow}
      replace={replace}
      {...props}
    >
      {children}
    </Link>
  );
}
