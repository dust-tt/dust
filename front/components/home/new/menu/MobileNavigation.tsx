"use client";

import { ChevronRightIcon, IconButton, MenuIcon } from "@dust-tt/sparkle";
import type { LinkProps } from "next/link";
import Link from "next/link";
import * as React from "react";

import { menuConfig } from "@app/components/home/new/menu/config";
import { ScrollArea } from "@app/components/home/new/ScrollArea";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@app/components/home/new/Sheet";
import { classNames } from "@app/lib/utils";

export function MobileNavigation() {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <IconButton size="md" icon={MenuIcon} className="text-slate-100" />
        </SheetTrigger>
        <SheetContent
          side="left"
          className="rounded-br-xl rounded-tr-xl border border-slate-300/20 bg-slate-800 pr-0"
        >
          <ScrollArea className="my-4 h-[calc(100vh-8rem)] pb-10 pl-6">
            <div className="flex flex-col space-y-2">
              {menuConfig.mainNav.map((item, index) => (
                <div key={index} className="flex flex-col space-y-4 pt-6">
                  {item.href ? (
                    <MobileLink
                      key={item.href}
                      href={item.href}
                      onOpenChange={setOpen}
                      className="font-semibold"
                    >
                      {item.title}
                    </MobileLink>
                  ) : (
                    <h4 className="block select-none space-y-1 rounded-md font-semibold leading-none text-slate-200 no-underline outline-none">
                      {item.title}
                    </h4>
                  )}
                  {item?.items?.length &&
                    item.items.map((item) => (
                      <React.Fragment key={item.href}>
                        {item.href ? (
                          <MobileLink href={item.href} onOpenChange={setOpen}>
                            <ChevronRightIcon className="h-5 w-5 text-slate-400" />{" "}
                            {item.title}
                          </MobileLink>
                        ) : (
                          item.title
                        )}
                      </React.Fragment>
                    ))}
                </div>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}

interface MobileLinkProps extends LinkProps {
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

function MobileLink({
  href,
  onOpenChange,
  className = "",
  children,
  ...props
}: MobileLinkProps) {
  return (
    <Link
      href={href}
      onClick={() => {
        onOpenChange?.(false);
      }}
      className={classNames(
        className,
        "flex select-none items-center gap-1 rounded-md leading-none text-slate-200 no-underline outline-none transition-colors",
        "hover:bg-accent focus:bg-accent hover:text-slate-100 hover:underline hover:underline-offset-4 focus:text-slate-100 active:text-slate-500"
      )}
      {...props}
    >
      {children}
    </Link>
  );
}
