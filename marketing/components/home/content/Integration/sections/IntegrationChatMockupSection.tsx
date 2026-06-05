import { H2, P } from "@app/components/home/ContentComponents";
import { getIcon } from "@app/components/resources/resources_icons";
import {
  ArrowUpIcon,
  CheckCircleIcon,
  ConversationMessageContainer,
  ConversationMessageContent,
  cn,
  Icon,
  Tooltip,
} from "@dust-tt/sparkle";
import { motion, useReducedMotion } from "framer-motion";

import type { ChatStoryline, IntegrationBase } from "../types";

// Tunable animation timings. Total runtime is roughly 4-5s on first mount.
// All durations are in seconds because framer-motion's `transition.duration`
// expects seconds (not ms) — kept that way to match its API.
const TIMING = {
  userBubbleDelaySeconds: 0.15,
  agentHeaderDelaySeconds: 0.9,
  toolCallStartSeconds: 1.4,
  toolCallStaggerSeconds: 0.25,
  responseIntroExtraSeconds: 0.45,
  sectionStaggerSeconds: 0.7,
  followUpExtraSeconds: 0.4,
  inputBarExtraSeconds: 0.35,
  bubbleDurationSeconds: 0.45,
};

interface IntegrationChatMockupSectionProps {
  integration: IntegrationBase;
  storyline: ChatStoryline;
}

export function IntegrationChatMockupSection({
  integration,
  storyline,
}: IntegrationChatMockupSectionProps) {
  // Respect reduced-motion preferences: skip all animation, render the
  // chat fully revealed. Required by accessibility and per [GEN1] — other
  // marketing pages with motion already honor this.
  const prefersReducedMotion = useReducedMotion();

  const toolCallAnimationEndSeconds =
    TIMING.toolCallStartSeconds +
    storyline.toolCalls.length * TIMING.toolCallStaggerSeconds;

  const responseIntroDelaySeconds =
    toolCallAnimationEndSeconds + TIMING.responseIntroExtraSeconds;

  // Each response section staggers in *after* the intro.
  const sectionBaseDelaySeconds =
    responseIntroDelaySeconds + TIMING.bubbleDurationSeconds + 0.1;

  const followUpDelaySeconds =
    sectionBaseDelaySeconds +
    storyline.responseSections.length * TIMING.sectionStaggerSeconds +
    TIMING.followUpExtraSeconds;

  const inputBarDelaySeconds =
    followUpDelaySeconds + TIMING.inputBarExtraSeconds;

  return (
    <div className="bg-muted/40 py-12 md:py-16">
      <div className="mx-auto max-w-3xl px-4">
        <H2 className="mb-2 text-center text-2xl font-semibold text-foreground md:text-3xl">
          See it in action with {integration.name}
        </H2>
        <P size="md" className="mb-8 text-center text-muted-foreground">
          A peek at how a Dust agent uses the {integration.name} tools to get
          things done.
        </P>

        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm md:p-6">
          <UserBubble
            text={storyline.userPrompt}
            prefersReducedMotion={!!prefersReducedMotion}
          />

          <div className="mt-6">
            <AgentHeader
              completedInSeconds={storyline.completedInSeconds}
              delaySeconds={
                prefersReducedMotion ? 0 : TIMING.agentHeaderDelaySeconds
              }
              prefersReducedMotion={!!prefersReducedMotion}
            />

            <ToolCallsStrip
              integration={integration}
              toolCalls={storyline.toolCalls}
              startDelaySeconds={
                prefersReducedMotion ? 0 : TIMING.toolCallStartSeconds
              }
              prefersReducedMotion={!!prefersReducedMotion}
            />

            <AgentResponseBubble
              storyline={storyline}
              introDelaySeconds={
                prefersReducedMotion ? 0 : responseIntroDelaySeconds
              }
              sectionsBaseDelaySeconds={
                prefersReducedMotion ? 0 : sectionBaseDelaySeconds
              }
              prefersReducedMotion={!!prefersReducedMotion}
            />

            {storyline.followUpPrompt && (
              <FollowUpSuggestion
                text={storyline.followUpPrompt}
                delaySeconds={prefersReducedMotion ? 0 : followUpDelaySeconds}
                prefersReducedMotion={!!prefersReducedMotion}
              />
            )}
          </div>

          <InputBar
            delaySeconds={prefersReducedMotion ? 0 : inputBarDelaySeconds}
            prefersReducedMotion={!!prefersReducedMotion}
          />
        </div>

        <P
          size="xs"
          className="mt-4 text-center text-xs text-muted-foreground/70"
        >
          Example agent output — not a live session.
        </P>
      </div>
    </div>
  );
}

interface UserBubbleProps {
  text: string;
  prefersReducedMotion: boolean;
}

function UserBubble({ text, prefersReducedMotion }: UserBubbleProps) {
  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: TIMING.bubbleDurationSeconds,
        delay: TIMING.userBubbleDelaySeconds,
      }}
    >
      <ConversationMessageContainer
        messageType="me"
        type="user"
        className="ml-auto max-w-[85%]"
      >
        <ConversationMessageContent type="user" reversed>
          <div className="text-sm">{text}</div>
        </ConversationMessageContent>
      </ConversationMessageContainer>
    </motion.div>
  );
}

interface AgentHeaderProps {
  completedInSeconds: number;
  delaySeconds: number;
  prefersReducedMotion: boolean;
}

function AgentHeader({
  completedInSeconds,
  delaySeconds,
  prefersReducedMotion,
}: AgentHeaderProps) {
  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, delay: delaySeconds }}
      className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground"
    >
      <span>Dust</span>
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">
        <Icon visual={CheckCircleIcon} size="xs" />
        Completed in {completedInSeconds}s
      </span>
    </motion.div>
  );
}

interface ToolCallsStripProps {
  integration: IntegrationBase;
  toolCalls: string[];
  startDelaySeconds: number;
  prefersReducedMotion: boolean;
}

function ToolCallsStrip({
  integration,
  toolCalls,
  startDelaySeconds,
  prefersReducedMotion,
}: ToolCallsStripProps) {
  const PartnerIcon = getIcon(integration.icon);

  return (
    <div className="mb-4 rounded-xl bg-muted/60 p-3">
      <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
        Using {integration.name}
      </div>
      <div className="flex flex-wrap gap-2">
        {toolCalls.map((toolName, index) => (
          <motion.div
            key={`${toolName}-${index}`}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.3,
              delay: startDelaySeconds + index * TIMING.toolCallStaggerSeconds,
            }}
          >
            <Tooltip
              label={`MCP tool call on ${integration.name}`}
              trigger={
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-2 py-1 font-mono text-xs text-foreground">
                  <Icon visual={PartnerIcon} size="xs" />
                  {toolName}
                  <Icon
                    visual={CheckCircleIcon}
                    size="xs"
                    className="text-green-600"
                  />
                </span>
              }
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

interface AgentResponseBubbleProps {
  storyline: ChatStoryline;
  introDelaySeconds: number;
  sectionsBaseDelaySeconds: number;
  prefersReducedMotion: boolean;
}

function AgentResponseBubble({
  storyline,
  introDelaySeconds,
  sectionsBaseDelaySeconds,
  prefersReducedMotion,
}: AgentResponseBubbleProps) {
  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: TIMING.bubbleDurationSeconds,
        delay: introDelaySeconds,
      }}
    >
      <ConversationMessageContainer messageType="agent" type="agent">
        <ConversationMessageContent type="agent">
          <div className="text-sm text-foreground">
            <p className="mb-3">{storyline.responseIntro}</p>

            {storyline.responseSections.map((section, sectionIndex) => (
              <motion.div
                key={sectionIndex}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.4,
                  delay:
                    sectionsBaseDelaySeconds +
                    sectionIndex * TIMING.sectionStaggerSeconds,
                }}
                className={cn(
                  sectionIndex < storyline.responseSections.length - 1 && "mb-4"
                )}
              >
                <h4 className="mb-2 text-sm font-semibold text-foreground">
                  {section.heading}
                </h4>
                <ul className="space-y-2">
                  {section.bullets.map((bullet, bulletIndex) => (
                    <li key={bulletIndex} className="flex gap-2">
                      <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                      <span>
                        <span className="font-medium text-foreground">
                          {bullet.title}.
                        </span>{" "}
                        <span className="text-muted-foreground">
                          {bullet.body}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </ConversationMessageContent>
      </ConversationMessageContainer>
    </motion.div>
  );
}

interface FollowUpSuggestionProps {
  text: string;
  delaySeconds: number;
  prefersReducedMotion: boolean;
}

function FollowUpSuggestion({
  text,
  delaySeconds,
  prefersReducedMotion,
}: FollowUpSuggestionProps) {
  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: delaySeconds }}
      className="mt-3 ml-1 text-sm italic text-muted-foreground"
    >
      {text}
    </motion.div>
  );
}

interface InputBarProps {
  delaySeconds: number;
  prefersReducedMotion: boolean;
}

function InputBar({ delaySeconds, prefersReducedMotion }: InputBarProps) {
  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, delay: delaySeconds }}
      aria-hidden
      className="mt-6 flex items-center gap-2 rounded-2xl border border-border bg-muted/30 px-3 py-2.5"
    >
      <span className="flex-1 select-none text-sm text-muted-foreground">
        Ask a follow-up…
      </span>
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-foreground/80 text-white">
        <Icon visual={ArrowUpIcon} size="xs" />
      </span>
    </motion.div>
  );
}
