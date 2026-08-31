import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { CONNECTOR_UI_CONFIGURATIONS } from "@app/lib/connector_providers_ui";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import type { ConnectorProvider } from "@app/types/data_source";
import type { UserType, WorkspaceType } from "@app/types/user";
import {
  AnchoredPopover,
  Avatar,
  Brain,
  Button,
  ConfettiBackground,
  cn,
  Globe01,
  Image01,
  Scan,
  SearchMd,
  Table,
  Tooltip,
  TypingAnimation,
} from "@dust-tt/sparkle";
import { useMemo, useRef, useState } from "react";

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
    icon: SearchMd,
  },
  {
    label: "Table query",
    icon: Table,
  },
  {
    label: "Extract data",
    icon: Scan,
  },
  {
    label: "Image generation",
    icon: Image01,
  },
  {
    label: "Web search and browsing",
    icon: Globe01,
  },
  {
    label: "Reasoning",
    icon: Brain,
  },
] as const;

const FAKE_AGENTS = [
  {
    name: "Translator",
    emoji: "💬",
    backgroundColor: "bg-success-200",
  },
  {
    name: "TrailblazerGuard",
    emoji: "👮",
    backgroundColor: "bg-highlight-100",
  },
  {
    name: "Transport",
    emoji: "🚌",
    backgroundColor: "bg-highlight-200",
  },
  {
    name: "TrendTracker",
    emoji: "😻",
    backgroundColor: "bg-warning-50",
  },
] as const;

const EXAMPLE_AGENTS = [
  {
    name: "FeedbackHelper",
    emoji: "❤️",
    backgroundColor: "bg-warning-100",
  },
  {
    name: "RiskAnalyzer",
    emoji: "💀",
    backgroundColor: "bg-success-800",
  },
  {
    name: "EngagementPro",
    emoji: "😂",
    backgroundColor: "bg-info-200",
  },
  {
    name: "RunbookMaster",
    emoji: "🧑‍🚀",
    backgroundColor: "bg-highlight-800",
  },
  {
    name: "BrandSpecialist",
    emoji: "👕",
    backgroundColor: "bg-highlight-200",
  },
  {
    name: "CrisisManager",
    emoji: "🚒",
    backgroundColor: "bg-warning-200",
  },
  {
    name: "PerformanceCoach",
    emoji: "🏆",
    backgroundColor: "bg-info-200",
  },
  {
    name: "StrategyPlanner",
    emoji: "🎯",
    backgroundColor: "bg-warning-100",
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

  const { hasPermission } = useWorkspacePermissions();

  const canCreateAgent = hasPermission("create", "agent");

  const connections = useMemo(() => {
    return Object.values(CONNECTOR_CONFIGURATIONS)
      .filter((connector) =>
        CONNECTIONS_IN_TOUR_GUIDE.includes(connector.connectorProvider)
      )
      .map((connector) => ({
        name: connector.name,
        logo: CONNECTOR_UI_CONFIGURATIONS[
          connector.connectorProvider
        ].getLogoComponent(),
      }));
  }, []);

  const steps: Step[] = [
    {
      body: (
        <>
          <div
            ref={centeredRef}
            className={cn(
              "flex aspect-video w-full items-center justify-center rounded-t-2xl p-6 text-center",
              "bg-brand-support-blue"
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
          <div className="copy-base px-3 text-muted-foreground">
            Discover the basics of Dust in {canCreateAgent ? "3" : "2"} steps.
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
              "relative flex aspect-video overflow-hidden rounded-t-2xl p-4 text-center",
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
          <div
            className={cn(
              "flex aspect-video flex-col items-center justify-center gap-4 rounded-t-2xl p-6 text-center",
              "bg-brand-support-rose"
            )}
          >
            <div className="grid grid-cols-6 gap-2">
              {connections.map((c) => (
                <Tooltip
                  key={c.name}
                  label={c.name}
                  trigger={
                    <Avatar
                      size="md"
                      icon={c.logo}
                      backgroundColor="bg-background"
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
                      backgroundColor="bg-primary-700"
                      iconColor="text-primary-50"
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
              <div className="copy-base px-3 text-muted-foreground">
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
    ...(canCreateAgent
      ? [
          {
            anchorRef: createAgentButtonRef,
            body: (
              <>
                <div className="flex aspect-video flex-col items-center justify-center gap-0 rounded-t-2xl bg-brand-support-golden p-6 text-center">
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
        ]
      : []),
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
        "border-highlight-400 ring-2 ring-highlight-400/30"
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
