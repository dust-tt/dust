import {
    Avatar,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    HandThumbDownIcon,
    HandThumbUpIcon,
    Icon,
    TooltipContent,
    TooltipProvider,
    TooltipRoot,
    TooltipTrigger,
  } from "@dust-tt/sparkle";
  import type { Meta, StoryObj } from "@storybook/react";
  import * as React from "react";

  import { MetricCard } from "../index_with_tw_base";
  
  const meta: Meta<typeof MetricCard.Root> = {
    title: "Components/MetricCard",
    component: MetricCard.Root,
    parameters: {
      layout: "padded",
    },
    tags: ["autodocs"],
  };
  
  export default meta;
  type Story = StoryObj<typeof MetricCard.Root>;
  

  export const Primary: Story = {
    name: "Default",
    render: () => (
      <MetricCard.Root size="md">
        <MetricCard.Header>
          <MetricCard.Title>Messages</MetricCard.Title>
        </MetricCard.Header>
        <MetricCard.Content>
          <div className="s-flex s-items-center s-gap-2">
            <div className="s-text-lg s-font-semibold s-text-element-900">
              847
            </div>
          </div>
        </MetricCard.Content>
      </MetricCard.Root>
    ),
  };
  
  export const AllExamples: Story = {
    render: () => (
      <div className="s-flex s-flex-col s-gap-8">
        <div className="s-flex s-flex-wrap s-gap-4">
          {(["xs", "sm", "md"] as const).map((size) => (
            <MetricCard.Root key={size} size={size}>
              <MetricCard.Header>
                <MetricCard.Title>Messages</MetricCard.Title>
              </MetricCard.Header>
              <MetricCard.Content>
                <div className="s-flex s-items-center s-gap-2">
                  <div className="s-text-lg s-font-semibold s-text-element-900">
                    847
                  </div>
                </div>
              </MetricCard.Content>
            </MetricCard.Root>
          ))}
        </div>
  
        <div className="s-flex s-flex-wrap s-gap-4">
          <MetricCard.Root size="sm">
            <MetricCard.Header>
              <MetricCard.Title>Reactions</MetricCard.Title>
            </MetricCard.Header>
            <MetricCard.Content>
              <div className="s-flex s-items-center s-gap-4">
                <div className="s-flex s-items-center s-gap-2">
                  <Icon
                    visual={HandThumbUpIcon}
                    size="sm"
                    className="s-text-element-600"
                  />
                  <div className="s-text-lg s-font-semibold s-text-element-900">
                    12
                  </div>
                </div>
                <div className="s-flex s-items-center s-gap-2">
                  <Icon
                    visual={HandThumbDownIcon}
                    size="sm"
                    className="s-text-element-600"
                  />
                  <div className="s-text-lg s-font-semibold s-text-element-900">
                    4
                  </div>
                </div>
              </div>
            </MetricCard.Content>
          </MetricCard.Root>
  
          <MetricCard.Root size="sm">
            <MetricCard.Header>
              <MetricCard.Title>Top users</MetricCard.Title>
            </MetricCard.Header>
            <MetricCard.Content>
              <div className="s-flex s-flex-col s-gap-2">
                <div className="s-flex s-items-center s-gap-2">
                  <div className="s-text-base s-font-bold s-text-element-800">
                    26
                  </div>
                </div>
  
                <TooltipProvider>
                  <div className="s-flex s-items-center s-gap-2">
                    <Avatar.Stack size="sm" isRounded>
                      <TooltipRoot>
                        <TooltipTrigger asChild>
                          <div>
                            <Avatar
                              name="Isabelle Doe"
                              visual="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <span>Isabelle Doe</span>
                        </TooltipContent>
                      </TooltipRoot>
  
                      <TooltipRoot>
                        <TooltipTrigger asChild>
                          <div>
                            <Avatar
                              name="Rafael Doe"
                              visual="https://dust.tt/static/droidavatar/Droid_Yellow_3.jpg"
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <span>Rafael Doe</span>
                        </TooltipContent>
                      </TooltipRoot>
  
                      <TooltipRoot>
                        <TooltipTrigger asChild>
                          <div>
                            <Avatar
                              name="Aria Doe"
                              visual="https://dust.tt/static/droidavatar/Droid_Red_3.jpg"
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <span>Aria Doe</span>
                        </TooltipContent>
                      </TooltipRoot>
                    </Avatar.Stack>
  
                    <DropdownMenu>
                      <DropdownMenuTrigger>
                        <div className="s-cursor-pointer s-text-sm s-text-element-700 hover:s-text-element-800">
                          +2
                        </div>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem>
                          <div className="s-flex s-items-center s-gap-2">
                            <Avatar
                              name="Omar Doe"
                              visual="https://dust.tt/static/droidavatar/Droid_Pink_3.jpg"
                              size="sm"
                            />
                            <span>Omar Doe</span>
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <div className="s-flex s-items-center s-gap-2">
                            <Avatar
                              name="Extra User"
                              visual="https://dust.tt/static/droidavatar/Droid_Blue_3.jpg"
                              size="sm"
                            />
                            <span>Extra User</span>
                          </div>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TooltipProvider>
              </div>
            </MetricCard.Content>
          </MetricCard.Root>
  
          <MetricCard.Root size="sm">
            <MetricCard.Header>
              <MetricCard.Title>Active Users</MetricCard.Title>
            </MetricCard.Header>
            <MetricCard.Content isLoading />
          </MetricCard.Root>
        </div>
      </div>
    ),
  };
  