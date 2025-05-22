import {
  ActionBrainIcon,
  ActionGlobeIcon,
  ActionImageIcon,
  ActionMagnifyingGlassIcon,
  ActionScanIcon,
  ActionTableIcon,
  Avatar,
  ConfettiBackground,
  Tooltip,
  TypingAnimation,
} from "@dust-tt/sparkle";
import { cn } from "@dust-tt/sparkle";
import { AnchoredPopover } from "@dust-tt/sparkle";
import { Button } from "@dust-tt/sparkle";
import { useMemo, useRef } from "react";
import { useState } from "react";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import type { ConnectorProvider, UserType, WorkspaceType } from "@app/types";

// We want exactly 12 connections in the tour guide to have a clean grid layout.
const CONNECTIONS_IN_TOUR_GUIDE: ConnectorProvider[] = [
  "google_drive",
  "notion",
  "slack",
  "snowflake",
  "bigquery",
  "confluence",
  "intercom",
  "microsoft",
  "salesforce",
  "zendesk",
  "github",
  "gong",
] as const;

// We want exactly 6 actions in the tour guide to have a clean grid layout.
// So they are hardcoded.  :/
const ACTIONS_IN_TOUR_GUIDE = [
  {
    label: "Search data",
    icon: ActionMagnifyingGlassIcon,
  },
  {
    label: "Table query",
    icon: ActionTableIcon,
  },
  {
    label: "Extract data",
    icon: ActionScanIcon,
  },
  {
    label: "Image generation",
    icon: ActionImageIcon,
  },
  {
    label: "Web search and browsing",
    icon: ActionGlobeIcon,
  },
  {
    label: "Reasoning",
    icon: ActionBrainIcon,
  },
] as const;

const FAKE_AGENTS = [
  {
    name: "Translator",
    emoji: "💬",
    backgroundColor: "bg-green-200 dark:bg-green-200-night",
  },
  {
    name: "TrailblazerGuard",
    emoji: "👮",
    backgroundColor: "bg-blue-100 dark:bg-blue-100-night",
  },
  {
    name: "Transport",
    emoji: "🚌",
    backgroundColor: "bg-blue-200 dark:bg-blue-200-night",
  },
  {
    name: "TrendTracker",
    emoji: "😻",
    backgroundColor: "bg-rose-50 dark:bg-rose-50-night",
  },
] as const;

const EXAMPLE_AGENTS = [
  {
    name: "FeedbackHelper",
    emoji: "❤️",
    backgroundColor: "bg-rose-100",
  },
  {
    name: "RiskAnalyzer",
    emoji: "💀",
    backgroundColor: "bg-lime-800",
  },
  {
    name: "EngagementPro",
    emoji: "😂",
    backgroundColor: "bg-golden-200",
  },
  {
    name: "RunbookMaster",
    emoji: "🧑‍🚀",
    backgroundColor: "bg-violet-800",
  },
  {
    name: "BrandSpecialist",
    emoji: "👕",
    backgroundColor: "bg-blue-200",
  },
  {
    name: "CrisisManager",
    emoji: "🚒",
    backgroundColor: "bg-red-200",
  },
  {
    name: "PerformanceCoach",
    emoji: "🏆",
    backgroundColor: "bg-yellow-200",
  },
  {
    name: "StrategyPlanner",
    emoji: "🎯",
    backgroundColor: "bg-pink-100",
  },
] as const;

type Step = {
  anchorRef?: React.ComponentProps<typeof AnchoredPopover>["anchorRef"];
  side?: React.ComponentProps<typeof AnchoredPopover>["side"];
  align?: React.ComponentProps<typeof AnchoredPopover>["align"];
  body: React.ReactNode;
};

export function WelcomeTourGuide({
  owner,
  user,
  isAdmin,
  startConversationRef,
  spaceMenuButtonRef,
  createAgentButtonRef,
  onTourGuideEnd,
}: {
  owner: WorkspaceType;
  user: UserType;
  isAdmin: boolean;
  startConversationRef: React.RefObject<HTMLDivElement>;
  spaceMenuButtonRef: React.RefObject<HTMLDivElement>;
  createAgentButtonRef: React.RefObject<HTMLDivElement>;
  onTourGuideEnd: () => void;
}) {
  const centeredRef = useRef<HTMLDivElement>(null);
  const [currentStep, setCurrentStep] = useState(0);

  const connections = useMemo(() => {
    return Object.values(CONNECTOR_CONFIGURATIONS)
      .filter((connector) =>
        CONNECTIONS_IN_TOUR_GUIDE.includes(connector.connectorProvider)
      )
      .map((connector) => ({
        name: connector.name,
        logo: connector.getLogoComponent(),
      }));
  }, []);

  const steps: Step[] = [
    {
      body: (
        <>
          <div
            ref={centeredRef}
            className={cn(
              "flex w-full items-center justify-center p-6 text-center",
              "aspect-video rounded-t-2xl bg-brand-support-blue"
            )}
          >
            <ConfettiBackground variant="confetti" referentSize={centeredRef} />
            <span className="heading-3xl">
              <TypingAnimation text={`Rise and shine, ${user.firstName}! 🌅`} />
            </span>
          </div>
          <div className="heading-lg px-3 pt-4">
            Welcome to the{" "}
            <span className="font-semibold text-brand-hunter-green">
              {owner.name}
            </span>{" "}
            workspace.
          </div>
          <div className="copy-base px-3 text-muted-foreground dark:text-muted-foreground-night">
            Discover the basics of Dust in 3 steps.
          </div>
        </>
      ),
    },
    {
      anchorRef: startConversationRef,
      side: "bottom",
      body: (
        <>
          <div
            className={cn(
              "relative flex overflow-hidden rounded-t-2xl p-4 text-center",
              "bg-brand-support-green"
            )}
          >
            <div className="flex gap-1">
              <div className="flex gap-1">
                <div className="heading-2xl text-highlight">@tra</div>
                <div className="h-8 w-1 animate-cursor-blink bg-foreground" />
              </div>
              <div className="flex h-60 flex-col gap-3 rounded-xl border p-3 pr-5 shadow-xl">
                {FAKE_AGENTS.map((agent) => (
                  <div
                    key={agent.name}
                    className="heading-base flex items-center gap-2"
                  >
                    <Avatar
                      size="sm"
                      emoji={agent.emoji}
                      backgroundColor={agent.backgroundColor}
                    />
                    {agent.name}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="heading-lg px-3 pt-4">
            Use <span className="font-semibold text-highlight">@mentions</span>{" "}
            to call agents and&nbsp;start a conversation.
          </div>
        </>
      ),
    },
    {
      anchorRef: spaceMenuButtonRef,
      side: "bottom",
      body: (
        <>
          <div className="flex flex-col items-center justify-center gap-4 rounded-t-2xl bg-brand-support-rose p-6 text-center">
            <div className="grid grid-cols-6 gap-2">
              {connections.map((c) => (
                <Tooltip
                  key={c.name}
                  label={c.name}
                  trigger={
                    <Avatar
                      size="md"
                      icon={c.logo}
                      backgroundColor="bg-white dark:bg-primary-800-night"
                    />
                  }
                />
              ))}
              {ACTIONS_IN_TOUR_GUIDE.map((action) => (
                <Tooltip
                  key={action.label}
                  label={action.label}
                  trigger={
                    <Avatar
                      size="md"
                      icon={action.icon}
                      backgroundColor="bg-gray-700"
                      iconColor="text-gray-50"
                    />
                  }
                />
              ))}
            </div>
          </div>
          {isAdmin ? (
            <>
              <div className="heading-lg px-3 pt-4">
                Make your agents smarter by adding&nbsp;
                <span className="text-brand-red-rose">knowledge and tools</span>
                .
              </div>
              <div className="copy-base px-3 text-muted-foreground dark:text-muted-foreground-night">
                Set up your connections and your tools in&nbsp;the{" "}
                <span className="font-semibold text-foreground">spaces</span>{" "}
                tab.
              </div>
            </>
          ) : (
            <>
              <div className="heading-lg px-3 pt-4">
                Explore your workspace{" "}
                <span className="text-brand-red-rose">knowledge and tools</span>{" "}
                in <span className="text-brand-red-rose">spaces</span>.
              </div>
            </>
          )}
        </>
      ),
    },
    {
      anchorRef: createAgentButtonRef,
      body: (
        <>
          <div className="flex flex-col items-center justify-center gap-0 rounded-t-2xl bg-brand-support-golden p-6 text-center">
            <div className="grid grid-cols-4 gap-2">
              {EXAMPLE_AGENTS.map((agent) => (
                <Tooltip
                  key={agent.name}
                  label={agent.name}
                  trigger={
                    <Avatar
                      size="lg"
                      emoji={agent.emoji}
                      backgroundColor={agent.backgroundColor}
                    />
                  }
                />
              ))}
            </div>
          </div>
          <div className="heading-lg px-3 pt-4">
            Create new custom agents{" "}
            <span className="text-brand-orange-golden">
              designed for your needs
            </span>
            .
          </div>
        </>
      ),
    },
  ];

  const open = currentStep < steps.length;
  if (!open) {
    return null;
  }

  const { anchorRef, side, align, body } = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  return (
    <AnchoredPopover
      open={open}
      anchorRef={anchorRef}
      side={side}
      align={align}
      className={cn(
        "w-[20rem] shadow-xl",
        "border-highlight-400 ring-2 ring-highlight-400/30",
        "dark:border-border-night dark:bg-background-night"
      )}
      fullWidth
    >
      {body}
      <div className="flex justify-end gap-2 p-2 pt-4">
        {!isLastStep && (
          <Button
            variant="outline"
            label="Dismiss"
            onClick={() => {
              setCurrentStep(steps.length);
              onTourGuideEnd();
            }}
          />
        )}
        <Button
          variant="highlight"
          label={isFirstStep ? "Start Tour" : isLastStep ? "Done" : "Next"}
          onClick={() => {
            if (isLastStep) {
              onTourGuideEnd();
            }
            setCurrentStep(currentStep + 1);
          }}
        />
      </div>
    </AnchoredPopover>
  );
}
