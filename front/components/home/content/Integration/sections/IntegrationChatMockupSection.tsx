import { getIcon } from "@app/components/resources/resources_icons";
import {
  ArrowUp,
  CheckCircle,
  ConversationMessageContainer,
  ConversationMessageContent,
  cn,
  DustLogoSquare,
  Icon,
  Tooltip,
} from "@dust-tt/sparkle";
import { motion, useReducedMotion } from "framer-motion";

import type { ChatStoryline, IntegrationBase } from "../types";

// Tunable animation timings for the agent's *conversation* (user prompt →
// agent reply chain). The chrome around the conversation (top bar, sidebar,
// input bar) is intentionally static — those are always visible to convey
// "this is the Dust app", not "this is loading right now".
//
// Durations are in seconds because framer-motion's `transition.duration`
// expects seconds (not ms).
const TIMING = {
  userBubbleDelaySeconds: 0.15,
  agentHeaderDelaySeconds: 0.9,
  toolCallStartSeconds: 1.4,
  toolCallStaggerSeconds: 0.25,
  responseIntroExtraSeconds: 0.45,
  sectionStaggerSeconds: 0.7,
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
  // chat fully revealed.
  const prefersReducedMotion = useReducedMotion();

  const toolCallAnimationEndSeconds =
    TIMING.toolCallStartSeconds +
    storyline.toolCalls.length * TIMING.toolCallStaggerSeconds;

  const responseIntroDelaySeconds =
    toolCallAnimationEndSeconds + TIMING.responseIntroExtraSeconds;

  const sectionBaseDelaySeconds =
    responseIntroDelaySeconds + TIMING.bubbleDurationSeconds + 0.1;

  return (
    <div className="bg-muted/40 py-12 md:py-16">
      <div className="mx-auto max-w-5xl px-4">
        {/* The whole mockup is wrapped in a card with Dust-app-style chrome:
            a top bar, a left sidebar (hidden on mobile), the chat area on
            the right, and a persistent input bar at the bottom of the chat
            area. It reads as a screenshot of the real product. */}
        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          <TopBar />

          <div className="flex">
            <SidebarMock integrationName={integration.name} />

            <main className="flex min-w-0 flex-1 flex-col">
              <div className="flex-1 space-y-4 p-4 md:p-6">
                <UserBubble
                  text={storyline.userPrompt}
                  prefersReducedMotion={!!prefersReducedMotion}
                />

                <div>
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
                </div>
              </div>

              {/* Persistent input bar: NOT animated. Always visible so the
                  mockup reads as a real product surface, not a loading
                  artifact. */}
              <PersistentInputBar />
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

function TopBar() {
  return (
    <div className="flex items-center gap-3 border-b border-border bg-muted/20 px-4 py-2.5">
      <DustLogoSquare className="h-5 w-5 shrink-0" />
      <span className="text-sm font-medium text-foreground">
        Dust · My workspace
      </span>
    </div>
  );
}

interface SidebarMockProps {
  integrationName: string;
}

function SidebarMock({ integrationName }: SidebarMockProps) {
  // Hidden on mobile to keep the chat area wide. Matches the real Dust app
  // conversation list layout. No top tabs or "+ New conversation" CTA — those
  // would only read right with the exact app icons, which we don't replicate
  // pixel-perfectly here.
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-muted/10 p-3 md:flex">
      <div className="space-y-0.5">
        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Recent
        </div>
        <SidebarItem label={`${integrationName} weekly recap`} active />
        <SidebarItem label="Pipeline analysis" />
        <SidebarItem label="Account research" />
        <SidebarItem label="Quarterly review" />
      </div>
    </aside>
  );
}

interface SidebarItemProps {
  label: string;
  active?: boolean;
}

function SidebarItem({ label, active = false }: SidebarItemProps) {
  return (
    <div
      className={cn(
        "truncate rounded-md px-2 py-1.5 text-xs transition-colors",
        active
          ? "bg-foreground/10 font-medium text-foreground"
          : "text-muted-foreground"
      )}
    >
      {label}
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
      className="mb-2"
    >
      {/* Top line: avatar + agent name, matches the real Dust conversation
          header where the agent's name renders next to its small avatar. */}
      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <DustLogoSquare className="h-4 w-4 shrink-0" />
        <span>dust</span>
      </div>
      {/* Second line: subtle "Completed in N sec" status. No green pill — the
          real app renders this as a small muted clickable row underneath the
          agent name. */}
      <div className="ml-5 text-xs text-muted-foreground">
        Completed in {completedInSeconds} sec
      </div>
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
                    visual={CheckCircle}
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

// Persistent input bar at the bottom of the chat area. Matches the real Dust
// InputBar: agent picker chip on the left (DustLogoSquare avatar + agent
// name), placeholder text, and a blue circular send button on the right.
// Always visible, never animated.
function PersistentInputBar() {
  return (
    <div className="border-t border-border bg-muted/10 p-3 md:p-4">
      <div
        aria-hidden
        className="flex flex-col gap-2 rounded-2xl border border-border bg-muted-background px-3 py-2.5"
      >
        <span className="select-none truncate text-sm text-muted-foreground">
          Ask a follow-up…
        </span>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-foreground/[0.06] px-1.5 py-0.5 text-xs font-medium text-foreground">
            <DustLogoSquare className="h-3.5 w-3.5 shrink-0" />
            dust
          </span>
          <span className="ml-auto inline-flex h-7 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500 text-white">
            <Icon visual={ArrowUp} size="xs" />
          </span>
        </div>
      </div>
    </div>
  );
}
