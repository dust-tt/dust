import { ChevronRightIcon, Icon } from "@dust-tt/sparkle";
import Link from "next/link";
import * as React from "react";

import { H4, Strong } from "@app/components/home/ContentComponents";
import { menuConfig } from "@app/components/home/menu/config";
import { classNames } from "@app/lib/utils";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "./NavigationMenu";

export function MainNavigation() {
  return (
    <NavigationMenu className="mr-4 hidden md:flex">
      <NavigationMenuList>
        {menuConfig.mainNav.map((item, index) => {
          return (
            <NavigationMenuItem key={index}>
              {item.href ? (
                <Link
                  href={item.href}
                  target={item.isExternal ? "_blank" : undefined}
                  legacyBehavior
                  passHref
                >
                  <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                    {item.title}
                  </NavigationMenuLink>
                </Link>
              ) : (
                <React.Fragment key={index}>
                  <NavigationMenuTrigger>{item.title}</NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="flex flex-col gap-4 p-6 pb-8">
                      <H4 className="text-white">{item.label}</H4>
                      <ul
                        className={classNames(
                          "grid-rows-" + item.rows,
                          "grid w-full grid-flow-col gap-x-8 gap-y-4"
                        )}
                      >
                        {item.items &&
                          item.items.map((item) => (
                            <ListItem
                              key={item.title}
                              title={item.title}
                              href={item.href}
                              isExternal={item.isExternal}
                            />
                          ))}
                      </ul>
                    </div>
                  </NavigationMenuContent>
                </React.Fragment>
              )}
            </NavigationMenuItem>
          );
        })}
      </NavigationMenuList>
    </NavigationMenu>
  );
}

const ListItem = React.forwardRef<
  React.ElementRef<"a">,
  React.ComponentPropsWithoutRef<"a"> & { isExternal?: boolean }
>(({ className = "", title, href, isExternal, ...props }, ref) => {
  if (!href) {
    return (
      <li>
        <Strong className="text-white">{title}</Strong>
      </li>
    );
  }

  return (
    <li>
      <NavigationMenuLink asChild>
        <Link
          ref={ref}
          className={classNames(
            "hover:bg-accent focus:bg-accent block cursor-pointer select-none space-y-1 rounded-md font-semibold leading-none text-slate-400 no-underline outline-none transition-colors hover:text-slate-100 hover:underline hover:underline-offset-4 focus:text-slate-100 active:text-slate-300",
            className
          )}
          href={href}
          target={isExternal ? "_blank" : undefined}
          shallow={!isExternal}
          {...props}
        >
          <div className="flex h-6 items-center gap-0.5">
            <Icon
              className="text-slate-600"
              visual={ChevronRightIcon}
              size="md"
            />
            <div className="text-md whitespace-nowrap font-medium leading-none">
              {title}
            </div>
          </div>
        </Link>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = "ListItem";
