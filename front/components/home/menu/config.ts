interface NavItem {
  title: string;
  href?: string;
  isExternal?: boolean;
  label?: string;
  rows?: number;
}

interface NavItemWithChildren extends NavItem {
  items?: NavItemWithChildren[];
}

interface MenuConfig {
  title: string;
  items: NavItemWithChildren[];
}

const CareersMenuConfig: MenuConfig = {
  title: "Careers",
  items: [
    {
      title: "About Us",
      href: "/home/about",
      isExternal: false,
    },
    {
      title: "Jobs",
      href: "/jobs",
      isExternal: true,
    },
    {
      title: "Why Dust?",
      href: "https://blog.dust.tt/why-dust/",
      isExternal: true,
    },
  ],
};

const SocialMenuConfig: MenuConfig = {
  title: "Social",
  items: [
    {
      title: "X",
      href: "https://x.com/DustHQ",
      isExternal: true,
    },
    {
      title: "LinkedIn",
      href: "https://www.linkedin.com/company/dust-tt/",
      isExternal: true,
    },
    {
      title: "YouTube",
      href: "https://www.youtube.com/@dust-tt",
      isExternal: true,
    },
  ],
};

// If you change this, make sure to update the links in the extension as well.
const LegalMenuConfig: MenuConfig = {
  title: "Legal & Security",
  items: [
    {
      title: "Security",
      href: "/home/security",
    },
    {
      title: "Vulnerability Disclosure",
      href: "/home/vulnerability",
    },
    {
      title: "Terms & Policies",
      href: "/terms",
      isExternal: true,
    },
    {
      title: "Trust Center",
      href: "https://app.vanta.com/dust.tt/trust/f3ytzxpay31bwsiyuqjto",
      isExternal: true,
    },
    {
      title: "Privacy Policy",
      href: "/platform-privacy",
      isExternal: true,
    },
    {
      title: "Website Privacy Policy",
      href: "/website-privacy",
      isExternal: true,
    },
  ],
};

const IndustriesMenuConfig: MenuConfig = {
  title: "Industries",
  items: [
    {
      title: "B2B SaaS",
      href: "/home/industry/b2b-saas",
    },
    {
      title: "Financial Services",
      href: "/home/industry/financial-services",
    },
    {
      title: "Insurance",
      href: "/home/industry/insurance",
    },
    {
      title: "Marketplaces",
      href: "/home/industry/marketplace",
    },
    {
      title: "Retail & E-commerce",
      href: "/home/industry/retail-ecommerce",
    },
  ],
};

const SolutionsMenuConfig: MenuConfig = {
  title: "Solutions",
  items: [
    {
      title: "Departments",
    },
    {
      title: "Sales",
      href: "/home/solutions/sales",
    },
    {
      title: "Customer Support",
      href: "/home/solutions/customer-support",
    },
    {
      title: "Marketing & Content",
      href: "/home/solutions/marketing",
    },
    {
      title: "Engineering",
      href: "/home/solutions/engineering",
    },
    {
      title: "Data & Analytics",
      href: "/home/solutions/data-analytics",
    },
    {
      title: "",
    },
    {
      title: "Knowledge",
      href: "/home/solutions/knowledge",
    },
    {
      title: "IT",
      href: "/home/solutions/it",
    },
    {
      title: "Legal",
      href: "/home/solutions/legal",
    },
    {
      title: "People",
      href: "/home/solutions/recruiting-people",
    },
    {
      title: "Productivity",
      href: "/home/solutions/productivity",
    },
    {
      title: IndustriesMenuConfig.title,
    },
    IndustriesMenuConfig.items[0],
    IndustriesMenuConfig.items[1],
    IndustriesMenuConfig.items[2],
    IndustriesMenuConfig.items[3],
    IndustriesMenuConfig.items[4],
  ],
};

const DevelopersMenuConfig: MenuConfig = {
  title: "Developers",
  items: [
    {
      title: "Developer Platform",
      href: "/home/solutions/dust-platform",
    },
    {
      title: "Dust for Engineers",
      href: "/home/solutions/engineering",
    },
    {
      title: "Platform Documentation",
      href: "https://docs.dust.tt",
      isExternal: true,
    },
    {
      title: "Github Repo",
      href: "https://github.com/dust-tt/dust",
      isExternal: true,
    },
  ],
};

const ProductMenuConfig: MenuConfig = {
  title: "Product",
  items: [
    {
      title: "Product",
      href: "/home/product",
    },
    {
      title: "Chrome Extension",
      href: "/home/chrome-extension",
    },
    {
      title: "Frames",
      href: "/home/frames",
    },
  ],
};

const BuildMenuConfig: MenuConfig = {
  title: "Build",
  items: [
    {
      title: "Get Started ",
      href: "https://docs.dust.tt/docs/intro",
      isExternal: true,
    },
    {
      title: "Guides & Tutorials",
      href: "https://docs.dust.tt/docs/use-cases",
      isExternal: true,
    },
  ],
};

const ExploreMenuConfig: MenuConfig = {
  title: "Explore",
  items: [
    {
      title: "Blog",
      href: "https://blog.dust.tt/",
      isExternal: true,
    },
    {
      title: "Webinars",
      href: "https://app.getcontrast.io/dust",
      isExternal: true,
    },
    {
      title: "Events",
      href: "https://lu.ma/dust",
      isExternal: true,
    },
    {
      title: "Customer Stories",
      href: "https://blog.dust.tt/tag/customer-stories/",
      isExternal: true,
    },
  ],
};

const ConnectMenuConfig: MenuConfig = {
  title: "Connect",
  items: [
    {
      title: "Slack Community",
      href: "https://dust-community.tightknit.community/join",
      isExternal: true,
    },

    {
      title: "Support",
      href: "/home/support",
      isExternal: false,
    },
    {
      title: "Become a Partner",
      href: "https://share-eu1.hsforms.com/2FctvfmFxRQqllduT_JmlTA2dzwm3",
      isExternal: true,
    },
  ],
};

const CompanyMenuConfig: MenuConfig = {
  title: "Company",
  items: [
    {
      title: CareersMenuConfig.title,
    },
    CareersMenuConfig.items[0],
    CareersMenuConfig.items[1],
    {
      title: SocialMenuConfig.title,
    },
    SocialMenuConfig.items[0],
    SocialMenuConfig.items[1],
    {
      title: "Legal",
    },
    LegalMenuConfig.items[1],
  ],
};

const ResourcesMenuConfig: MenuConfig = {
  title: "Resources",
  items: [
    {
      title: BuildMenuConfig.title,
    },
    BuildMenuConfig.items[0],
    BuildMenuConfig.items[1],
    {
      title: ExploreMenuConfig.title,
    },
    ExploreMenuConfig.items[0],
    ExploreMenuConfig.items[1],
    {
      title: "",
    },
    ExploreMenuConfig.items[2],
    ExploreMenuConfig.items[3],
    {
      title: ConnectMenuConfig.title,
    },
    ConnectMenuConfig.items[0],
    ConnectMenuConfig.items[1],
    {
      title: "",
    },
    ConnectMenuConfig.items[2],
  ],
};

interface DocsConfig {
  mainNav: NavItemWithChildren[];
  mobileNav: NavItemWithChildren[];
  footerNav: NavItemWithChildren[];
}

export const menuConfig: DocsConfig = {
  mainNav: [
    {
      title: ProductMenuConfig.title,
      label: "Discover Dust",
      rows: 2,
      items: ProductMenuConfig.items,
    },
    {
      title: SolutionsMenuConfig.title,
      label: "Dust for...",
      rows: 6,
      items: SolutionsMenuConfig.items,
    },
    {
      title: DevelopersMenuConfig.title,
      label: "Build with Dust",
      rows: 2,
      items: DevelopersMenuConfig.items,
    },
    {
      title: ResourcesMenuConfig.title,
      label: "Resources",
      rows: 3,
      items: ResourcesMenuConfig.items,
    },
    {
      title: CompanyMenuConfig.title,
      label: "All about Dust",
      rows: 3,
      items: CompanyMenuConfig.items,
    },
    {
      title: "Security",
      href: "/home/security",
    },
    {
      title: "Pricing",
      href: "/home/pricing",
    },
  ],
  mobileNav: [
    {
      title: ProductMenuConfig.title,
      items: ProductMenuConfig.items,
    },
    {
      title: "Pricing",
      href: "/home/pricing",
    },
    {
      title: SolutionsMenuConfig.title,
      items: SolutionsMenuConfig.items,
    },
    {
      title: DevelopersMenuConfig.title,
      items: DevelopersMenuConfig.items,
    },
    {
      title: BuildMenuConfig.title,
      items: BuildMenuConfig.items,
    },
    {
      title: ExploreMenuConfig.title,
      items: ExploreMenuConfig.items,
    },
    {
      title: ConnectMenuConfig.title,
      items: ConnectMenuConfig.items,
    },
    {
      title: CareersMenuConfig.title,
      items: CareersMenuConfig.items,
    },
    {
      title: SocialMenuConfig.title,
      items: SocialMenuConfig.items,
    },
    {
      title: LegalMenuConfig.title,
      items: LegalMenuConfig.items,
    },
  ],
  footerNav: [
    {
      title: "Product",
      items: [
        {
          title: "Product",
          href: "/home/product",
        },
        {
          title: "Chrome Extension",
          href: "/home/chrome-extension",
        },
        {
          title: "Pricing",
          href: "/home/pricing",
        },
        {
          title: "Security",
          href: "/home/security",
        },
      ],
    },
    {
      title: SolutionsMenuConfig.title,
      items: SolutionsMenuConfig.items,
    },
    {
      title: DevelopersMenuConfig.title,
      items: DevelopersMenuConfig.items,
    },
    {
      title: "Company",
      items: [
        {
          title: "About Us",
          href: "/home/about",
        },
        {
          title: "Jobs",
          href: "/jobs",
          isExternal: true,
        },
        {
          title: "Support",
          href: "/home/support",
        },
        {
          title: "Become a Partner",
          href: "https://share-eu1.hsforms.com/2FctvfmFxRQqllduT_JmlTA2dzwm3",
          isExternal: true,
        },
      ],
    },
    {
      title: "Connect",
      items: [
        {
          title: "Slack Community",
          href: "https://dust-community.tightknit.community/join",
          isExternal: true,
        },
        {
          title: "X",
          href: "https://x.com/DustHQ",
          isExternal: true,
        },
        {
          title: "LinkedIn",
          href: "https://www.linkedin.com/company/dust-tt/",
          isExternal: true,
        },
        {
          title: "YouTube",
          href: "https://www.youtube.com/@dust-tt",
          isExternal: true,
        },
      ],
    },
    {
      title: "Legal",
      items: [
        {
          title: "Terms & Policies",
          href: "/terms",
          isExternal: true,
        },
        {
          title: "Privacy Policy",
          href: "/platform-privacy",
          isExternal: true,
        },
        {
          title: "Trust Center",
          href: "https://app.vanta.com/dust.tt/trust/f3ytzxpay31bwsiyuqjto",
          isExternal: true,
        },
        {
          title: "Vulnerability Disclosure",
          href: "/home/vulnerability",
        },
      ],
    },
  ],
};
