import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import React from "react";

import { cn } from "@app/components/poke/shadcn/lib/utils";

interface PokeLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  external?: boolean;
  children: React.ReactNode;
}

const PokeLink = React.forwardRef<HTMLAnchorElement, PokeLinkProps>(
  ({ href, external = false, children, className, ...props }, ref) => {
    const linkClasses = cn(
      "relative text-gray-700",
      "transition-colors duration-200",
      "after:absolute after:bottom-0 after:left-0 after:right-0",
      "after:h-[1px] after:bg-gray-300",
      "after:transition-all after:duration-300 after:ease-in-out",
      "hover:after:h-full hover:after:opacity-30",
      "after:opacity-50",
      className
    );

    const linkContent = (
      <>
        <span className="relative z-10">{children}</span>
        {external && (
          <ExternalLinkIcon className="relative z-10 ml-1 inline-block h-3 w-3" />
        )}
      </>
    );

    return external ? (
      <a
        href={href}
        className={linkClasses}
        target="_blank"
        rel="noopener noreferrer"
        ref={ref}
        {...props}
      >
        {linkContent}
      </a>
    ) : (
      <Link href={href} passHref legacyBehavior>
        <a className={linkClasses} ref={ref} {...props}>
          {linkContent}
        </a>
      </Link>
    );
  }
);
PokeLink.displayName = "PokeLink";

export default PokeLink;
