interface NavItem {
  title: string;
  href?: string;
  target?: string;
  label?: string;
}

interface NavItemWithChildren extends NavItem {
  items?: NavItemWithChildren[];
}

interface DocsConfig {
  mainNav: NavItemWithChildren[];
}

export const menuConfig: DocsConfig = {
  mainNav: [
    {
      title: "Product",
      href: "/hidden-copy",
    },
    {
      title: "Solutions",
      label: "Dust for...",
      items: [
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
      ],
    },
    {
      title: "Developers",
      label: "Build with Dust",
      items: [
        {
          title: "Dust Platform",
          href: "/solutions/dust-platform",
        },
        {
          title: "Dust for engineers",
          href: "/developers",
        },
        {
          title: "Platform Documentation",
          href: "https://docs.dust.tt",
          target: "_blank",
        },
        {
          title: "Github Repo",
          href: "https://github.com/dust-tt/dust",
          target: "_blank",
        },
      ],
    },
    {
      title: "Pricing",
      href: "/pricing",
    },
    {
      title: "Security",
      href: "/security",
    },
  ],
};
