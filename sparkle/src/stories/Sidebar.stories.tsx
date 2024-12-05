import type { Meta } from "@storybook/react";
import React from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@sparkle/components";
import {
  CircleIcon,
  Cog6ToothIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  ShapesIcon,
} from "@sparkle/icons";
import { useIsMobile } from "@sparkle/lib";

const meta = {
  title: "NewLayouts/Sidebar",
} satisfies Meta;

export default meta;

export function Demo() {
  return (
    <div className="s-flex s-flex-col s-gap-6">
      <Layout>Hello World</Layout>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main>
        <SidebarTrigger />
        {children}
      </main>
    </SidebarProvider>
  );
}

// Menu items.
const items = [
  {
    title: "Home",
    url: "#",
    icon: HomeIcon,
  },
  {
    title: "Inbox",
    url: "#",
    icon: ShapesIcon,
  },
  {
    title: "Calendar",
    url: "#",
    icon: CircleIcon,
  },
  {
    title: "Search",
    url: "#",
    icon: MagnifyingGlassIcon,
  },
  {
    title: "Settings",
    url: "#",
    icon: Cog6ToothIcon,
  },
];

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Application</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <a href={item.url}>
                      <Icon visual={item.icon} size="sm" />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction showOnHover />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      className="w-48"
                      side={useIsMobile() ? "bottom" : "right"}
                      align={useIsMobile() ? "end" : "start"}
                    >
                      <DropdownMenuItem>
                        <span>View Project</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <span>Share Project</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>
                        <span>Delete Project</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
