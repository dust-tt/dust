import { ChevronRightIcon, Icon } from "@dust-tt/sparkle";
import Link from "next/link";
import * as React from "react";

import { H4, Strong } from "@app/components/home/ContentComponents";
import { menuConfig } from "@app/components/home/menu/config";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@app/components/home/menu/NavigationMenu";
import { classNames } from "@app/lib/utils";
import { appendUTMParams } from "@app/lib/utils/utm";

export function MainNavigation() {
  const [nav, setNav] = React.useState("");

  return (
    <NavigationMenu className="mr-4 hidden xl:flex" onValueChange={setNav}>
      <NavigationMenuList>
        {menuConfig.mainNav.map((item, index) => {
          return (
            <NavigationMenuItem key={index} value={item.title}>
              {item.href ? (
                <Link
                  href={
                    item.isExternal ? item.href : appendUTMParams(item.href)
                  }
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
                  <NavigationMenuContent
                    forceMount
                    className={classNames(
                      nav === item.title
                        ? "block h-auto opacity-100"
                        : "hidden h-0 opacity-0"
                    )}
                  >
                    <div className="flex flex-col gap-4 p-6 pb-8">
                      <H4 className="text-muted-foreground" mono>
                        {item.label}
                      </H4>
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
        <Strong className="text-slate-700">{title}</Strong>
      </li>
    );
  }

  return (
    <li>
      <NavigationMenuLink asChild>
        <Link
          ref={ref}
          className={classNames(
            "label-base block cursor-pointer select-none space-y-1 text-foreground no-underline outline-none transition-colors hover:text-highlight hover:underline hover:underline-offset-4 active:text-highlight-600",
            className
          )}
          href={isExternal ? href : appendUTMParams(href)}
          target={isExternal ? "_blank" : undefined}
          shallow={!isExternal}
          {...props}
        >
          <div className="flex h-6 items-center gap-0.5">
            <Icon
              className="text-primary-300"
              visual={ChevronRightIcon}
              size="md"
            />
            <div className="whitespace-nowrap">{title}</div>
          </div>
        </Link>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = "ListItem";
