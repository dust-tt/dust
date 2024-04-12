import { ChevronRightIcon, Icon } from "@dust-tt/sparkle";
import React from "react";

import { A, H4, Strong } from "@app/components/home/new/ContentComponents";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@app/components/home/new/NavigationMenu";

const solutions: { title: string; target: string }[] = [
  {
    title: "Customer Support",
    target: "for_customer",
  },
  {
    title: "Marketing & Content",
    target: "for_marketing",
  },
  {
    title: "Recruiting & People",
    target: "for_people",
  },
  // {
  //   title: "Sales & Revenue",
  //   target: "for_sales",
  // },
  // {
  //   title: "Engineering",
  //   target: "for_engineering",
  // },
  // {
  //   title: "Knowledge Management",
  //   target: "for_knowledge",
  // },
  // {
  //   title: "Data & Analaytics",
  //   target: "for_data",
  // },
];

const devs: { title: string; target: string }[] = [
  {
    title: "Dust for engineers",
    target: "for_engineering",
  },
  {
    title: "Building Dust apps",
    target: "dust_apps",
  },
  {
    title: "Platform Doc",
    target: "https://docs.dust.tt",
  },
  {
    title: "Github Repo",
    target: "https://github.com/dust-tt/dust",
  },
];

interface ListItemProps extends React.ComponentPropsWithoutRef<"a"> {
  target: string;
  title: string;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => Promise<void>;
}

const ListItem = React.forwardRef<React.ElementRef<"a">, ListItemProps>(
  ({ title, onClick, target }, ref) => {
    const isExternalLink = target && target.startsWith("http");
    console.log("isExternalLink", isExternalLink);

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
            onClick={handleClick}
            href={isExternalLink ? target : `/?${target}`}
            target={isExternalLink ? "_blank" : undefined}
            rel={isExternalLink ? "noopener noreferrer" : undefined}
          >
            <div className="s-flex s-items-center s-gap-1.5 s-text-slate-50">
              <Icon
                className="text-slate-500"
                visual={ChevronRightIcon}
                size="md"
              />
              <A variant="tertiary">{title}</A>
            </div>
          </a>
        </NavigationMenuLink>
      </li>
    );
  }
);
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
              variant={currentPage === "product" ? "secondary" : "tertiary"}
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
              <H4 className="col-span-2 text-white">Dust for…</H4>
              {solutions.map((solution, index) => (
                <ListItem
                  key={index}
                  title={solution.title}
                  target={solution.target}
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
              <H4 className="col-span-2 text-white">Build with Dust</H4>
              {devs.map((dev, index) => (
                <ListItem
                  key={index}
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
              variant={currentPage === "pricing" ? "secondary" : "tertiary"}
              className="pr-2"
            >
              Pricing
            </A>
          </NavigationMenuLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink onClick={() => onPageChange("security")}>
            <A
              variant={currentPage === "security" ? "secondary" : "tertiary"}
              className="pr-2"
            >
              Security
            </A>
          </NavigationMenuLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>More</NavigationMenuTrigger>
          <NavigationMenuContent>
            <div className="grid gap-4 p-6 pb-8 text-white lg:w-[580px] lg:grid-cols-3">
              <H4 className="col-span-3 text-white">All about Dust</H4>

              <ul className="flex flex-col gap-4">
                <Strong>Careers</Strong>
                <ListItem
                  target="https://www.notion.so/dust-tt/Jobs-a67e20f0dc2942fdb77971b73251466e/"
                  title="Jobs"
                />
                <ListItem
                  target="https://www.linkedin.com/company/dust-tt/"
                  title="LinkedIn"
                />
              </ul>
              <ul className="flex flex-col gap-4">
                <Strong>About</Strong>
                <ListItem target="https://blog.dust.tt/" title="Blog" />
                <ListItem target="https://x.com/dust4ai" title="@dust4ai" />
                <ListItem target="https://github.com/dust-tt" title="GitHub" />
              </ul>
              <ul className="flex flex-col gap-4">
                <Strong>Legal</Strong>
                <ListItem
                  target="https://dust-tt.notion.site/Website-Privacy-Policy-a118bb3472f945a1be8e11fbfb733084"
                  title="Privacy Policy"
                />
                <ListItem
                  target="https://dust-tt.notion.site/Website-Terms-of-Use-ff8665f52c454e0daf02195ec0d6bafb"
                  title="Terms of Use"
                />
                <ListItem
                  target="https://dust-tt.notion.site/Legal-Notice-58b453f74d634ef7bb807d29a59b3db1"
                  title="Legal Notice"
                />
                <ListItem
                  target="https://dust-tt.notion.site/Cookie-Notice-ec63a7fb72104a7babff1bf413e2c1ec"
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
