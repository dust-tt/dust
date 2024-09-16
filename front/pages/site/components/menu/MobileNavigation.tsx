import {
  ChevronRightIcon,
  IconButton,
  LogoHorizontalColorLogo,
  MenuIcon,
} from "@dust-tt/sparkle";
import type { LinkProps } from "next/link";
import Link from "next/link";
import * as React from "react";

import { classNames } from "@app/lib/utils";
import { menuConfig } from "@app/pages/site/components/menu/config";
import { ScrollArea } from "@app/pages/site/components/ScrollArea";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@app/pages/site/components/Sheet";

export function MobileNavigation() {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="flex md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <IconButton size="md" icon={MenuIcon} className="text-slate-100" />
        </SheetTrigger>
        <SheetContent
          side="left"
          className="rounded-br-xl rounded-tr-xl border border-slate-300/20 bg-slate-800 px-10 py-0"
        >
          <ScrollArea className="h-[100vh]">
            <div className="flex flex-col space-y-0 py-12">
              <div className="pb-6">
                <LogoHorizontalColorLogo className="h-6 w-24" />
              </div>
              {menuConfig.mobileNav.map((item, index) => (
                <div key={index} className="flex flex-col space-y-0 pt-4">
                  {item.href ? (
                    <MobileLink
                      key={item.href}
                      href={item.href}
                      onOpenChange={setOpen}
                      isExternal={item.isExternal}
                    >
                      {item.title}
                    </MobileLink>
                  ) : (
                    <div className="block select-none py-2 text-xs font-medium uppercase leading-none text-slate-400 no-underline outline-none">
                      {item.title}
                    </div>
                  )}
                  {item?.items?.length &&
                    item.items.map((item) => (
                      <React.Fragment key={item.href}>
                        {item.href ? (
                          <MobileLink
                            href={item.href}
                            onOpenChange={setOpen}
                            isExternal={item.isExternal}
                          >
                            <ChevronRightIcon className="h-5 w-5 text-slate-500" />{" "}
                            {item.title}
                          </MobileLink>
                        ) : (
                          <div className="block select-none py-2 pt-4 text-xs font-medium uppercase leading-none text-slate-400 no-underline outline-none">
                            {item.title}
                          </div>
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
  children: React.ReactNode;
  className?: string;
  isExternal?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function MobileLink({
  href,
  onOpenChange,
  children,
  isExternal,
  ...props
}: MobileLinkProps) {
  return (
    <Link
      href={href}
      onClick={() => {
        onOpenChange?.(false);
      }}
      shallow={!isExternal}
      target={isExternal ? "_blank" : undefined}
      className={classNames(
        "flex select-none items-center gap-1 rounded-md py-3 font-semibold leading-none text-slate-50 no-underline outline-none transition-colors",
        "hover:bg-accent focus:bg-accent hover:text-slate-100 hover:underline hover:underline-offset-4 focus:text-slate-100 active:text-slate-500"
      )}
      {...props}
    >
      {children}
    </Link>
  );
}
