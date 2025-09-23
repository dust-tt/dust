import { DustLogoGray } from "@dust-tt/sparkle";
import type { LinkProps } from "next/link";
import Link from "next/link";
import * as React from "react";

import { A, Grid } from "@app/components/home/ContentComponents";
import { menuConfig } from "@app/components/home/menu/config";
import { appendUTMParams } from "@app/lib/utils/utm";

export function FooterNavigation() {
  return (
    <div className="z-11 mt-12 flex w-full flex-col items-center gap-6 border-b border-t border-border bg-muted-background pb-16 pt-12">
      <div className="w-full px-6 sm:px-12">
        <Grid gap="gap-6">
          <div className="col-span-12">
            <DustLogoGray className="h-6 w-24" />
          </div>
          {menuConfig.footerNav.map((item, index) => (
            <div
              key={index}
              className="col-span-6 flex flex-col space-y-2 sm:col-span-4 md:col-span-2"
            >
              {item.href ? (
                <FooterLink
                  key={item.href}
                  href={item.href}
                  isExternal={item.isExternal}
                >
                  {item.title}
                </FooterLink>
              ) : (
                <div className="copy-xs block select-none py-2 font-semibold uppercase leading-none text-primary-400 no-underline outline-none">
                  {item.title}
                </div>
              )}
              {item?.items?.length &&
                item.items
                  .filter((item) => item.title.trim() !== "")
                  .map((item, itemIndex) => (
                    <React.Fragment key={item.href || `item-${itemIndex}`}>
                      {item.href ? (
                        <FooterLink
                          href={item.href}
                          isExternal={item.isExternal}
                        >
                          {item.title}
                        </FooterLink>
                      ) : (
                        <div className="copy-xs block select-none py-2 pt-4 uppercase text-primary-800 no-underline outline-none">
                          {item.title}
                        </div>
                      )}
                    </React.Fragment>
                  ))}
            </div>
          ))}
        </Grid>
      </div>
    </div>
  );
}

interface FooterLinkProps extends LinkProps {
  children: React.ReactNode;
  className?: string;
  isExternal?: boolean;
}

function FooterLink({ href, children, isExternal, ...props }: FooterLinkProps) {
  return (
    <Link
      href={isExternal ? href : appendUTMParams(href.toString())}
      shallow={!isExternal}
      target={isExternal ? "_blank" : undefined}
      {...props}
    >
      <A variant="secondary" className="label-sm">
        {children}
      </A>
    </Link>
  );
}
