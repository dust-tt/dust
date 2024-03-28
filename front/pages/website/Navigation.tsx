import { ChevronRightIcon, Icon } from "@dust-tt/sparkle";
import React from "react";

import { A, H4, Strong } from "@app/components/home/contentComponents";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@app/components/home/NavigationMenu";
import { classNames } from "@app/lib/utils";

const solutions: { title: string; target: string }[] = [
  {
    title: "Customer Support",
    target: "for_customer",
  },
  {
    title: "Marketing teams",
    target: "for_marketing",
  },
  {
    title: "HR & Recruiting",
    target: "for_people",
  },
  {
    title: "Sales teams",
    target: "for_sales",
  },
  {
    title: "Engineering",
    target: "for_engineering",
  },
  {
    title: "Knowledge Management",
    target: "for_knowledge",
  },
  {
    title: "Data & Analaytics",
    target: "for_data",
  },
  {
    title: "People Operations",
    target: "for_people",
  },
  {
    title: "Product",
    target: "for_product",
  },
  {
    title: "Finance",
    target: "for_finance",
  },
  {
    title: "IT & Security",
    target: "for_it",
  },
];

const devs: { title: string; target: string }[] = [
  {
    title: "Dust for engineers",
    target: "for_engineers",
  },
  {
    title: "Building Dust apps",
    target: "dust_apps",
  },
  {
    target: "https://docs.dust.tt",
    title: "Platform Doc",
  },
  {
    title: "Github Repo",
    target: "https://github.com/dust-tt/dust",
  },
];

const ListItem = React.forwardRef<
  React.ElementRef<"a">,
  React.ComponentPropsWithoutRef<"a"> & { target?: string }
>(({ className, title, onClick, target }, ref) => {
  const isExternalLink = target && target.startsWith("http");

  const handleClick = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isExternalLink && onClick) {
      event.preventDefault();
      await onClick(event);
    }
  };

  return (
    <li>
      <NavigationMenuLink asChild>
        <a
          ref={ref}
          className={classNames(className ? className : "")}
          onClick={handleClick}
          href={isExternalLink ? target : `/?${target}`}
          target={isExternalLink ? "_blank" : undefined}
          rel={isExternalLink ? "noopener noreferrer" : undefined}
        >
          <div className="flex items-center gap-1.5 text-slate-50">
            <Icon visual={ChevronRightIcon} size="md" />
            <A variant="tertiary">{title}</A>
          </div>
        </a>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = "ListItem";

export function Navigation({
  currentPage,
  onPageChange,
}: {
  currentPage: string;
  onPageChange: (page: string) => void;
}) {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuLink onClick={() => onPageChange("product")}>
            <A
              variant={currentPage === "product" ? "primary" : "tertiary"}
              className="pr-2"
            >
              Product
            </A>
          </NavigationMenuLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Solutions</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid gap-4 p-6 pb-8 lg:w-[560px] lg:grid-cols-2">
              <H4 className="col-span-2 text-emerald-400">Dust for…</H4>
              {solutions.map((solution) => (
                <ListItem
                  key={solution.title}
                  title={solution.title}
                  onClick={async (event) => {
                    event.preventDefault();
                    await onPageChange(solution.target);
                  }}
                />
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Developpers</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid gap-4 p-6 pb-8 lg:w-[560px] lg:grid-cols-2">
              <H4 className="col-span-2 text-amber-400">Build with Dust</H4>
              {devs.map((dev) => (
                <ListItem
                  key={dev.title}
                  title={dev.title}
                  target={dev.target}
                  onClick={async (event) => {
                    if (dev.target && !dev.target.startsWith("http")) {
                      event.preventDefault();
                      await onPageChange(dev.target);
                    }
                  }}
                />
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink onClick={() => onPageChange("pricing")}>
            <A
              variant={currentPage === "pricing" ? "primary" : "tertiary"}
              className="pr-2"
            >
              Pricing
            </A>
          </NavigationMenuLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>More</NavigationMenuTrigger>
          <NavigationMenuContent>
            <div className="grid gap-4 p-6 pb-8 lg:w-[580px] lg:grid-cols-3">
              <H4 className="col-span-3 text-pink-400">All about Dust</H4>

              <ul className="flex flex-col gap-4">
                <Strong>Careers</Strong>
                <ListItem
                  href="https://www.notion.so/dust-tt/Jobs-a67e20f0dc2942fdb77971b73251466e/"
                  title="Jobs"
                />
                <ListItem
                  href="https://www.linkedin.com/company/dust-tt/"
                  title="LinkedIn"
                />
              </ul>
              <ul className="flex flex-col gap-4">
                <Strong>About</Strong>
                <ListItem href="https://blog.dust.tt/" title="Blog" />
                <ListItem href="https://x.com/dust4ai" title="@dust4ai" />
                <ListItem href="https://github.com/dust-tt" title="GitHub" />
              </ul>
              <ul className="flex flex-col gap-4">
                <Strong>Legal</Strong>
                <ListItem
                  href="https://dust-tt.notion.site/Website-Privacy-Policy-a118bb3472f945a1be8e11fbfb733084"
                  title="Privacy Policy"
                />
                <ListItem href="/terms" title="Terms of Use" />
                <ListItem
                  href="https://dust-tt.notion.site/Legal-Notice-58b453f74d634ef7bb807d29a59b3db1"
                  title="Legal Notice"
                />
                <ListItem
                  href="https://dust-tt.notion.site/Cookie-Notice-ec63a7fb72104a7babff1bf413e2c1ec"
                  title="Cookie Notice"
                />
              </ul>
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
