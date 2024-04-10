"use client";

import { ChevronRightIcon, Icon } from "@dust-tt/sparkle";
import Link from "next/link";
import * as React from "react";

import { H4, Strong } from "@app/components/home/new/ContentComponents";
import { classNames } from "@app/lib/utils";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "../new/NavigationMenu";

const solutions: { title: string; href: string }[] = [
  {
    title: "Customer Support",
    href: "/solutions/customer-support",
  },
  {
    title: "Marketing & Content",
    href: "/solutions/marketing-content",
  },
  {
    title: "Recruiting & People",
    href: "/solutions/recruiting-people",
  },
];

const developers: { title: string; href: string; target?: string }[] = [
  {
    title: "Dust for engineers",
    href: "/developers",
  },
  {
    title: "Building Dust apps",
    href: "/developers/dust-apps",
  },
  {
    title: "Documentation",
    href: "https://docs.dust.tt",
    target: "_blank",
  },
  {
    title: "Github Repo",
    href: "https://github.com/dust-tt/dust",
    target: "_blank",
  },
];

export function Navigation() {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <Link href="/" legacyBehavior passHref>
            <NavigationMenuLink className={navigationMenuTriggerStyle()}>
              Product
            </NavigationMenuLink>
          </Link>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Solutions</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-4 p-6 pb-8 md:w-[500px] md:grid-cols-2 lg:w-[600px] ">
              <H4 className="col-span-2 text-white">Dust for…</H4>
              {solutions.map((item) => (
                <ListItem
                  key={item.title}
                  title={item.title}
                  href={item.href}
                />
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Developers</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-4 p-6 pb-8 md:w-[500px] md:grid-cols-2 lg:w-[600px] ">
              <H4 className="col-span-2 text-white">Build with Dust</H4>
              {developers.map((item) => (
                <ListItem
                  key={item.title}
                  title={item.title}
                  href={item.href}
                  target={item.target}
                />
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <Link href="/pricing" legacyBehavior passHref>
            <NavigationMenuLink className={navigationMenuTriggerStyle()}>
              Pricing
            </NavigationMenuLink>
          </Link>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <Link href="/security" legacyBehavior passHref>
            <NavigationMenuLink className={navigationMenuTriggerStyle()}>
              Security
            </NavigationMenuLink>
          </Link>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>More</NavigationMenuTrigger>
          <NavigationMenuContent>
            <div className="grid w-[400px] gap-4 p-6 pb-8 md:w-[500px] md:grid-cols-2 lg:w-[600px] lg:grid-cols-3">
              <H4 className="col-span-3 text-white">All about Dust</H4>
              <ul className="flex flex-col gap-4">
                <Strong className="text-white">Careers</Strong>
                <ListItem
                  href="https://www.notion.so/dust-tt/Jobs-a67e20f0dc2942fdb77971b73251466e/"
                  title="Jobs"
                  target="_blank"
                />
                <ListItem
                  href="https://www.linkedin.com/company/dust-tt/"
                  title="LinkedIn"
                  target="_blank"
                />
              </ul>
              <ul className="flex flex-col gap-4">
                <Strong className="text-white">About</Strong>
                <ListItem
                  href="https://blog.dust.tt/"
                  target="_blank"
                  title="Blog"
                />
                <ListItem
                  href="https://x.com/dust4ai"
                  title="@dust4ai"
                  target="_blank"
                />
                <ListItem
                  href="https://github.com/dust-tt"
                  title="GitHub"
                  target="_blank"
                />
              </ul>
              <ul className="flex flex-col gap-4">
                <Strong className="text-white">Legal</Strong>
                <ListItem
                  href="https://dust-tt.notion.site/Website-Privacy-Policy-a118bb3472f945a1be8e11fbfb733084"
                  title="Privacy Policy"
                  target="_blank"
                />
                <ListItem
                  href="https://dust-tt.notion.site/Website-Terms-of-Use-ff8665f52c454e0daf02195ec0d6bafb"
                  title="Terms of Use"
                  target="_blank"
                />
                <ListItem
                  href="https://dust-tt.notion.site/Legal-Notice-58b453f74d634ef7bb807d29a59b3db1"
                  title="Legal Notice"
                  target="_blank"
                />
                <ListItem
                  href="https://dust-tt.notion.site/Cookie-Notice-ec63a7fb72104a7babff1bf413e2c1ec"
                  title="Cookie Notice"
                  target="_blank"
                />
              </ul>
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}

const ListItem = React.forwardRef<
  React.ElementRef<"a">,
  React.ComponentPropsWithoutRef<"a">
>(({ className = "", title, ...props }, ref) => {
  return (
    <li>
      <NavigationMenuLink asChild>
        <a
          ref={ref}
          className={classNames(
            "hover:bg-accent focus:bg-accent block select-none space-y-1 rounded-md font-semibold leading-none text-slate-400 no-underline outline-none transition-colors hover:text-slate-100 hover:underline hover:underline-offset-4 focus:text-slate-100 active:text-slate-500",
            className
          )}
          {...props}
        >
          <div className="flex items-center gap-1.5">
            <Icon className="" visual={ChevronRightIcon} size="md" />
            <div className="text-md font-medium leading-none">{title}</div>
          </div>
        </a>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = "ListItem";
