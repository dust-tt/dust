import {
  BookOpenIcon,
  ChatBubbleBottomCenterTextIcon,
  ContentMessage,
  InformationCircleIcon,
  Tabs,
  TabsList,
  TabsTrigger,
  ToolsIcon,
} from "@dust-tt/sparkle";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactNode } from "react";
import React, { useMemo } from "react";

import { useActiveSpaceId } from "@app/hooks/useActiveSpaceId";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import type { WorkspaceType } from "@app/types";

interface SpaceTabConfig {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isCurrent: (currentRoute: string) => boolean;
}

const getSpaceTabs = (): SpaceTabConfig[] => {
  return [
    {
      id: "conversations",
      label: "Conversations",
      icon: ChatBubbleBottomCenterTextIcon,
      isCurrent: (route) => route.includes("/conversations"),
    },
    {
      id: "knowledge",
      label: "Knowledge",
      icon: BookOpenIcon,
      isCurrent: (route) => route.includes("/knowledge"),
    },
    {
      id: "tools",
      label: "Tools",
      icon: ToolsIcon,
      isCurrent: (route) => route.includes("/tools"),
    },
    {
      id: "about",
      label: "About this project",
      icon: InformationCircleIcon,
      isCurrent: (route) => route.includes("/about"),
    },
  ];
};

interface SpaceTabsWrapperProps {
  owner: WorkspaceType;
  children: ReactNode;
}

export function SpaceTabsWrapper({ owner, children }: SpaceTabsWrapperProps) {
  const router = useRouter();
  const spaceId = useActiveSpaceId();
  const { spaceInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId,
  });

  const tabs = useMemo(() => getSpaceTabs(), []);

  const currentTab = useMemo(() => {
    const currentTabConfig = tabs.find((tab) => tab.isCurrent(router.pathname));
    return currentTabConfig?.id ?? "conversations";
  }, [tabs, router.pathname]);

  const handleTabChange = (value: string) => {
    if (!spaceId) {
      return;
    }
    const baseUrl = `/w/${owner.sId}/conversation/space/${spaceId}`;
    void router.push(`${baseUrl}/${value}`);
  };

  return (
    <div className="flex w-full items-center justify-center overflow-auto">
      <div className="max-h-dvh flex w-full flex-col gap-8 pb-2 pt-4 sm:w-full sm:max-w-3xl sm:pb-4">
        <ContentMessage title="Experimental feature" variant="info" size="lg">
          <p>
            This feature is currently in alpha, and only available in the Dust
            workspace ("projects" feature flag). The goal is to get feedback
            from internal usage and quickly iterate. Share your feedback in the{" "}
            <Link
              href="https://dust4ai.slack.com/archives/C09T7N4S6GG"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-600"
            >
              initiative slack channel
            </Link>
            .
          </p>
        </ContentMessage>

        <div className="heading-xl text-xl">{spaceInfo?.name}</div>

        <Tabs value={currentTab} onValueChange={handleTabChange}>
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                label={tab.label}
                icon={tab.icon}
              />
            ))}
          </TabsList>

          {children}
        </Tabs>
      </div>
    </div>
  );
}
