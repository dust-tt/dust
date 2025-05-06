import { Meta, StoryFn } from "@storybook/react";
import React, { useRef, useState } from "react";

import {
  Avatar,
  ConfettiBackground,
  Icon,
  TypingAnimation,
} from "@sparkle/components";
import { Button } from "@sparkle/components/Button";
import {
  BookOpenIcon,
  BrainIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  RobotIcon,
  TableIcon,
} from "@sparkle/icons";
import { GithubLogo, GoogleLogo, NotionLogo, SlackLogo } from "@sparkle/logo";

import {
  TourGuide,
  TourGuideCard,
  TourGuideCardContent,
  TourGuideCardTitle,
  TourGuideCardVisual,
} from "../components/TourGuide";

export default {
  title: "Modules/TourGuide",
  component: TourGuide,
  parameters: {
    layout: "fullscreen",
  },
} as Meta;

const Template: StoryFn = () => {
  const topRightRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const bottomLeftRef = useRef<HTMLDivElement>(null);
  const [key, setKey] = useState(0);

  const handleRestart = () => {
    setKey((k) => k + 1);
  };
  const referentRef = useRef<HTMLDivElement>(null);
  const filteredAgents = [
    {
      name: "Translator",
      emoji: "💬",
      backgroundColor: "s-bg-green-200",
    },
    {
      name: "TrendTracker",
      emoji: "😻",
      backgroundColor: "s-bg-rose-50",
    },
    {
      name: "TrailblazerGuard",
      emoji: "👮",
      backgroundColor: "s-bg-blue-100",
    },
    {
      name: "TriumphRobot",
      emoji: "🍾",
      backgroundColor: "s-bg-yellow-200",
    },
    {
      name: "Transport",
      emoji: "🚌",
      backgroundColor: "s-bg-blue-200",
    },
  ] as const;
  return (
    <div className="s-relative s-min-h-screen s-w-full">
      <div className="s-absolute s-left-3 s-top-3">
        <Button label="Restart Tour" onClick={handleRestart} />
      </div>
      <div
        ref={topRightRef}
        className="s-absolute s-right-6 s-top-6 s-cursor-pointer s-rounded-lg s-border s-border-blue-100 s-bg-blue-50 s-p-4 s-transition-colors hover:s-bg-blue-100"
      >
        Top Right Element
      </div>
      <div
        ref={centerRef}
        className="s-absolute s-left-1/2 s-top-1/2 s--translate-x-1/2 s--translate-y-1/2 s-cursor-pointer s-rounded-lg s-border s-border-green-100 s-bg-green-50 s-p-4 s-transition-colors hover:s-bg-green-100"
      >
        Centered Element
      </div>
      <div
        ref={bottomLeftRef}
        className="s-absolute s-bottom-6 s-left-6 s-cursor-pointer s-rounded-lg s-border s-border-red-100 s-bg-red-50 s-p-4 s-transition-colors hover:s-bg-red-100"
      >
        Bottom Left Element
      </div>
      <TourGuide key={key} autoStart>
        <TourGuideCard>
          <TourGuideCardVisual
            ref={referentRef}
            className="s-flex s-items-center s-justify-center s-bg-brand-support-blue s-px-6 s-text-center"
          >
            <ConfettiBackground variant="confetti" referentSize={referentRef} />
            <span className="s-heading-3xl">
              <TypingAnimation text="Rise and shine, Edouard! 🌅" />
            </span>
          </TourGuideCardVisual>
          <TourGuideCardTitle>
            Welcome to the{" "}
            <span className="s-font-semibold s-text-brand-electric-blue">
              Qonto
            </span>{" "}
            workspace.
          </TourGuideCardTitle>
          <TourGuideCardContent>
            {" "}
            Discover Dust’s basics in 3 steps.
          </TourGuideCardContent>
        </TourGuideCard>
        <TourGuideCard anchorRef={centerRef}>
          <TourGuideCardVisual className="s-relative s-flex s-overflow-hidden s-bg-brand-support-green s-p-4 s-text-center">
            <div className="s-flex s-gap-1">
              <div className="s-flex s-gap-1">
                <div className="s-heading-2xl s-text-highlight">@tra</div>
                <div className="s-h-[32px] s-w-[3px] s-animate-cursor-blink s-bg-foreground" />
              </div>
              <div className="s-flex s-h-[240px] s-flex-col s-gap-3 s-rounded-xl s-border s-border-border s-bg-background s-p-3 s-pr-5 s-shadow-xl">
                {filteredAgents.map((agent) => {
                  return (
                    <div
                      key={agent.name}
                      className="s-heading-base s-flex s-items-center s-gap-2 s-text-foreground"
                    >
                      <Avatar
                        size="sm"
                        emoji={agent.emoji}
                        backgroundColor={agent.backgroundColor}
                      />
                      {agent.name}
                    </div>
                  );
                })}
              </div>
            </div>
          </TourGuideCardVisual>
          <TourGuideCardTitle>
            Use{" "}
            <span className="s-font-semibold s-text-highlight">@mentions</span>{" "}
            to call Agents and&nbsp;start a conversation
          </TourGuideCardTitle>
          <TourGuideCardContent className="s-py-2">
            <Button
              label="Watch the full video"
              icon={PlayIcon}
              variant={"outline"}
            />
          </TourGuideCardContent>
        </TourGuideCard>
        <TourGuideCard anchorRef={topRightRef}>
          <TourGuideCardVisual className="s-flex s-flex-col s-items-center s-justify-center s-gap-4 s-bg-brand-support-rose s-px-6 s-text-center">
            <div className="s-grid s-grid-cols-4 s-gap-2">
              <Icon visual={BookOpenIcon} size="lg" />
              <Icon visual={MagnifyingGlassIcon} size="lg" />
              <Icon visual={TableIcon} size="lg" />
              <Icon visual={BrainIcon} size="lg" />
              <Icon visual={NotionLogo} size="lg" />
              <Icon visual={GoogleLogo} size="lg" />
              <Icon visual={SlackLogo} size="lg" />
              <Icon visual={GithubLogo} size="lg" />
            </div>
            <span className="s-heading-2xl">
              <TypingAnimation text="Knowledge & Tools" />
            </span>
          </TourGuideCardVisual>
          <TourGuideCardTitle>
            Make your agents smarter with&nbsp;
            <span className="s-text-brand-red-rose">knowledge and tools</span>
          </TourGuideCardTitle>
          <TourGuideCardContent className="s-py-2">
            <Button
              label="Watch the full video"
              icon={PlayIcon}
              variant={"outline"}
            />
          </TourGuideCardContent>
        </TourGuideCard>
        <TourGuideCard anchorRef={bottomLeftRef}>
          <TourGuideCardVisual className="s-flex s-flex-col s-items-center s-justify-center s-gap-0 s-px-6 s-text-center">
            <Icon
              className="s-text-brand-orange-golden"
              visual={RobotIcon}
              size="xl"
            />
            <span className="s-heading-mono-2xl s-text-brand-orange-golden">
              <TypingAnimation text="Create an Agent" />
            </span>
          </TourGuideCardVisual>
          <TourGuideCardTitle>
            Create new custom agents{" "}
            <span className="s-text-brand-orange-golden">
              designed for your needs
            </span>
          </TourGuideCardTitle>
          <TourGuideCardContent className="s-py-2">
            <Button
              label="Watch the full video"
              icon={PlayIcon}
              variant={"outline"}
            />
          </TourGuideCardContent>
        </TourGuideCard>
      </TourGuide>
    </div>
  );
};

export const Default = Template.bind({});
