import {
  ActionImageIcon,
  Avatar,
  classNames,
  ConfettiBackground,
  Tooltip,
  TourGuide,
  TourGuideCard,
  TourGuideCardContent,
  TourGuideCardTitle,
  TourGuideCardVisual,
  TypingAnimation,
} from "@dust-tt/sparkle";
import { useRef } from "react";

import { ACTION_SPECIFICATIONS } from "@app/lib/actions/utils";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import type { UserType, WorkspaceType } from "@app/types";

export const WelcomeTourGuide = ({
  owner,
  user,
  startConversationRef,
  spaceMenuButtonRef,
  createAgentButtonRef,
  onTourGuideEnd,
}: {
  owner: WorkspaceType;
  user: UserType;
  startConversationRef: React.RefObject<HTMLDivElement>;
  spaceMenuButtonRef: React.RefObject<HTMLDivElement>;
  createAgentButtonRef: React.RefObject<HTMLDivElement>;
  onTourGuideEnd: () => void;
}) => {
  const centeredRef = useRef<HTMLDivElement>(null);
  const filteredAgents = [
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

  return (
    <TourGuide autoStart onEnd={onTourGuideEnd} onDismiss={onTourGuideEnd}>
      <TourGuideCard anchorRef={undefined}>
        <TourGuideCardVisual
          className={classNames(
            "flex items-center justify-center px-6 text-center",
            "bg-brand-support-blue"
          )}
          ref={centeredRef}
        >
          <ConfettiBackground variant="confetti" referentSize={centeredRef} />
          <span className="heading-3xl">
            <TypingAnimation text={`Rise and shine, ${user.firstName}! 🌅`} />
          </span>
        </TourGuideCardVisual>
        <TourGuideCardTitle>
          Welcome to the{" "}
          <span
            className={classNames("font-semibold", "text-brand-hunter-green")}
          >
            {owner.name}
          </span>{" "}
          workspace.
        </TourGuideCardTitle>
        <TourGuideCardContent>
          {" "}
          Discover the basics of Dust in 3 steps.
        </TourGuideCardContent>
      </TourGuideCard>
      <TourGuideCard anchorRef={startConversationRef} side="bottom">
        <TourGuideCardVisual
          className={classNames(
            "relative flex overflow-hidden p-4 text-center",
            "bg-brand-support-green"
          )}
        >
          <div className="flex gap-1">
            <div className="flex gap-1">
              <div
                className={classNames(
                  "heading-2xl",
                  "text-highlight dark:text-highlight-night"
                )}
              >
                @tra
              </div>
              <div
                className={classNames(
                  "h-[32px] w-[3px] animate-cursor-blink",
                  "bg-foreground dark:bg-foreground-night"
                )}
              />
            </div>
            <div
              className={classNames(
                "flex h-[240px] flex-col gap-3 rounded-xl border p-3 pr-5 shadow-xl",
                "border-border bg-background dark:border-border-night dark:bg-background-night"
              )}
            >
              {filteredAgents.map((agent) => {
                return (
                  <div
                    key={agent.name}
                    className={classNames(
                      "heading-base flex items-center gap-2",
                      "text-foreground dark:text-foreground-night"
                    )}
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
          <span
            className={classNames(
              "font-semibold",
              "text-highlight dark:text-highlight-night"
            )}
          >
            @mentions
          </span>{" "}
          to call Agents and&nbsp;start a conversation.
        </TourGuideCardTitle>
        {/* <TourGuideCardContent className="py-2">
          <Button
            label="Watch the full video"
            icon={PlayIcon}
            variant={"outline"}
          />
        </TourGuideCardContent> */}
      </TourGuideCard>
      <TourGuideCard anchorRef={spaceMenuButtonRef} side="bottom">
        <TourGuideCardVisual
          className={classNames(
            "flex flex-col items-center justify-center gap-4 p-6 text-center",
            "dark:bg-brand-support-rose-night bg-brand-support-rose"
          )}
        >
          <div className="grid grid-cols-6 gap-2">
            {Object.values(CONNECTOR_CONFIGURATIONS)
              .filter(
                (connector) => connector.connectorProvider !== "webcrawler"
              )
              .map((connector) => {
                return (
                  <Tooltip
                    key={connector.name}
                    label={connector.name}
                    trigger={
                      <Avatar
                        size="md"
                        icon={connector.getLogoComponent()}
                        backgroundColor="bg-white dark:s-bg-primary-800-night"
                      />
                    }
                  />
                );
              })}
            {Object.values(ACTION_SPECIFICATIONS).map((action) => {
              return (
                <Tooltip
                  key={action.label}
                  label={action.label}
                  trigger={
                    <Avatar
                      size="md"
                      icon={action.cardIcon}
                      backgroundColor="bg-gray-700"
                      iconColor="text-gray-50"
                    />
                  }
                />
              );
            })}
            <Tooltip
              label="Image generation"
              trigger={
                <Avatar
                  size="md"
                  icon={ActionImageIcon}
                  backgroundColor="bg-gray-700"
                  iconColor="text-gray-50"
                />
              }
            />
          </div>
        </TourGuideCardVisual>
        <TourGuideCardTitle>
          Make your agents smarter by adding&nbsp;
          <span className="text-brand-red-rose dark:text-brand-red-rose">
            knowledge and tools
          </span>{" "}
          from your{" "}
          <span className="text-brand-red-rose dark:text-brand-red-rose">
            spaces
          </span>
          .
        </TourGuideCardTitle>
        {/* <TourGuideCardContent className="py-2">
          <Button
            label="Watch the full video"
            icon={PlayIcon}
            variant={"outline"}
          />
        </TourGuideCardContent> */}
      </TourGuideCard>
      <TourGuideCard anchorRef={createAgentButtonRef}>
        <TourGuideCardVisual
          className={classNames(
            "flex flex-col items-center justify-center gap-0 px-6 text-center",
            "dark:bg-brand-support-golden-night bg-brand-support-golden"
          )}
        >
          <div className="grid grid-cols-4 gap-2">
            <Tooltip
              label="FeedbackHelper"
              trigger={
                <Avatar size="lg" emoji="❤️" backgroundColor="bg-rose-100" />
              }
            />
            <Tooltip
              label="RiskAnalyzer"
              trigger={
                <Avatar size="lg" emoji="💀" backgroundColor="bg-lime-800" />
              }
            />
            <Tooltip
              label="EngagementPro"
              trigger={
                <Avatar size="lg" emoji="😂" backgroundColor="bg-golden-200" />
              }
            />
            <Tooltip
              label="RunbookMaster"
              trigger={
                <Avatar size="lg" emoji="🧑‍🚀" backgroundColor="bg-violet-800" />
              }
            />
            <Tooltip
              label="BrandSpecialist"
              trigger={
                <Avatar size="lg" emoji="👕" backgroundColor="bg-blue-200" />
              }
            />
            <Tooltip
              label="CrisisManager"
              trigger={
                <Avatar size="lg" emoji="🚒" backgroundColor="bg-red-200" />
              }
            />
            <Tooltip
              label="PerformanceCoach"
              trigger={
                <Avatar size="lg" emoji="🏆" backgroundColor="bg-yellow-200" />
              }
            />
            <Tooltip
              label="StrategyPlanner"
              trigger={
                <Avatar size="lg" emoji="🎯" backgroundColor="bg-pink-100" />
              }
            />
          </div>
        </TourGuideCardVisual>
        <TourGuideCardTitle>
          Create new custom agents{" "}
          <span
            className={classNames(
              "dark:text-brand-orange-golden-night text-brand-orange-golden"
            )}
          >
            designed for your needs
          </span>
          .
        </TourGuideCardTitle>
        {/* <TourGuideCardContent className="py-2">
          <Button
            label="Watch the full video"
            icon={PlayIcon}
            variant={"outline"}
          />
        </TourGuideCardContent> */}
      </TourGuideCard>
    </TourGuide>
  );
};
