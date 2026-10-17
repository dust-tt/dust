import {
  cn,
  Icon,
  Notification,
  Stars02,
  Page,
  useSendNotification,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Agent, Skill } from "../data";
import { getRandomGreetingForName } from "../data/greetings";
import { DiscoverAgentComposer } from "./DiscoverAgentComposer";
import { DiscoverAgentDiscoverPage } from "./DiscoverAgentDiscoverPage";
import { DiscoverAgentNavigation } from "./DiscoverAgentSidebar";
import {
  CURRENT_USER,
  DEFAULT_AGENT,
  SUGGESTED_PROMPTS,
  type SuggestedPrompt,
} from "./discoverAgentData";
import {
  composerEntranceStyle,
  discoverButtonEntranceStyle,
  greetingWordStyle,
  heroEntranceStyle,
  usePrefersReducedMotion,
  useTypewriter,
} from "./discoverAgentMotion";

// ── Scroll-to-fill ──────────────────────────────────────────────────────────
// The home page does not scroll on its own. Wheel intent while on it fills
// the Discover button instead; once full, the panel scrolls to the Discover
// page below. Scrolling back to the very top returns to the home stage.

// Total wheel distance (px) that fills the button.
const FILL_DISTANCE_PX = 900;
// Idle time after which a partial fill drains back to zero.
const FILL_IDLE_RESET_MS = 700;

// `transition` keeps the scroller locked while the smooth scroll to the
// Discover page plays, so a trailing wheel tick cannot interrupt it midway.
type Stage = "home" | "transition" | "discover";

// Fallback for browsers without `scrollend`.
const TRANSITION_FALLBACK_MS = 800;

/**
 * Playground for the agent discovery experience: a front-end prototype of the
 * production new-conversation page (`/w/:wId/conversation/new`), rebuilt from
 * the same Sparkle components and the same layout classes as
 * `AppContentLayout` → `Navigation` → `ConversationContainer`, fed with the
 * playground's fake data. Desktop layout only.
 *
 * Explorations on top of production: a typing suggestion banner above the
 * composer, and a fill-to-scroll "Discover Skills and agents" button that
 * leads to a catalogue page below the home.
 */
export function DiscoverAgentView() {
  return (
    <Notification.Area>
      <DiscoverAgentPage />
    </Notification.Area>
  );
}

function DiscoverAgentPage() {
  const sendNotification = useSendNotification();

  const [isNavigationBarOpen, setNavigationBarOpen] = useState(true);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(
    DEFAULT_AGENT
  );
  const [selectedSkills, setSelectedSkills] = useState<Skill[]>([]);
  const [draft, setDraft] = useState("");
  // Picking a suggestion types its draft in; any keystroke takes over.
  const typewriter = useTypewriter(setDraft);
  const handleDraftChange = useCallback(
    (value: string) => {
      typewriter.cancel();
      setDraft(value);
    },
    [typewriter]
  );
  // Bumped by "New" so the hero remounts and replays its entrance, the way a
  // fresh navigation to /conversation/new does.
  const [heroKey, setHeroKey] = useState(0);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const discoverRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Stage>("home");
  const [fillProgress, setFillProgress] = useState(0);
  const fillRef = useRef(0);
  const idleTimerRef = useRef<number | null>(null);

  const goToDiscover = useCallback(() => {
    // Hold the ring at full while the page travels, so completing it reads
    // as the cause of the move; it resets once the Discover page has landed.
    fillRef.current = 1;
    setFillProgress(1);
    setStage("transition");
    const scroller = scrollerRef.current;
    const target = discoverRef.current;
    if (!scroller || !target) {
      setStage("discover");
      fillRef.current = 0;
      setFillProgress(0);
      return;
    }
    // Programmatic scrolling works on an overflow-hidden element, so the
    // scroller stays locked to wheel input until the animation ends.
    let done = false;
    const finish = () => {
      if (done) {
        return;
      }
      done = true;
      scroller.removeEventListener("scrollend", finish);
      window.clearTimeout(fallback);
      setStage("discover");
      fillRef.current = 0;
      setFillProgress(0);
    };
    scroller.addEventListener("scrollend", finish, { once: true });
    const fallback = window.setTimeout(finish, TRANSITION_FALLBACK_MS);
    scroller.scrollTo({ top: target.offsetTop, behavior: "smooth" });
  }, []);

  const goHome = useCallback(() => {
    fillRef.current = 0;
    setFillProgress(0);
    const scroller = scrollerRef.current;
    if (!scroller || scroller.scrollTop <= 0) {
      setStage("home");
      return;
    }
    // Stay on the discover stage while scrolling so the scroller is not
    // locked mid-animation; the scroll listener flips the stage at the top.
    scroller.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Wheel intent on the home stage fills the button instead of scrolling;
  // during the transition it is swallowed so the animation completes.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || stage === "discover") {
      return;
    }

    const handleWheel = (e: WheelEvent) => {
      if (stage === "transition") {
        e.preventDefault();
        return;
      }
      if (e.deltaY <= 0) {
        return;
      }
      e.preventDefault();
      fillRef.current = Math.min(
        1,
        fillRef.current + e.deltaY / FILL_DISTANCE_PX
      );
      setFillProgress(fillRef.current);

      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
      }
      if (fillRef.current >= 1) {
        goToDiscover();
        return;
      }
      idleTimerRef.current = window.setTimeout(() => {
        fillRef.current = 0;
        setFillProgress(0);
      }, FILL_IDLE_RESET_MS);
    };

    scroller.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      scroller.removeEventListener("wheel", handleWheel);
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
      }
    };
  }, [stage, goToDiscover]);

  // On the discover stage, scrolling back to the very top hands control back
  // to the home stage. On the home stage the scroller is locked to wheel
  // input, but focus() and scrollIntoView() can still move it, so any stray
  // offset snaps back to the top.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || stage === "transition") {
      return;
    }
    const handleScroll = () => {
      if (stage === "discover") {
        if (scroller.scrollTop <= 0) {
          setStage("home");
        }
      } else if (scroller.scrollTop > 0) {
        scroller.scrollTop = 0;
      }
    };
    scroller.addEventListener("scroll", handleScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", handleScroll);
  }, [stage]);

  const handleNewConversation = useCallback(() => {
    setActiveConversationId(null);
    setSelectedAgent(DEFAULT_AGENT);
    setSelectedSkills([]);
    setDraft("");
    setHeroKey((k) => k + 1);
    goHome();
  }, [goHome]);

  const handleSubmit = useCallback(
    (text: string) => {
      const withSkills =
        selectedSkills.length > 0
          ? ` · ${selectedSkills.map((s) => s.name).join(", ")}`
          : "";
      sendNotification({
        type: "success",
        title: "Conversation created",
        description: selectedAgent
          ? `@${selectedAgent.name}${withSkills}: “${text}”`
          : `“${text}”`,
      });
      setSelectedSkills([]);
    },
    [sendNotification, selectedAgent, selectedSkills]
  );

  const handleUseAgent = useCallback(
    (agent: Agent) => {
      setSelectedAgent(agent);
      goHome();
    },
    [goHome]
  );

  const handleUseSkill = useCallback(
    (skill: Skill) => {
      setSelectedSkills((skills) =>
        skills.some((s) => s.id === skill.id) ? skills : [...skills, skill]
      );
      goHome();
    },
    [goHome]
  );

  return (
    // AppContentLayout (front/components/sparkle/AppContentLayout.tsx)
    <div className={cn("flex flex-col", "h-dvh")}>
      <div className={cn("flex flex-row", "min-h-0 flex-1")}>
        <DiscoverAgentNavigation
          isNavigationBarOpen={isNavigationBarOpen}
          setNavigationBarOpen={setNavigationBarOpen}
          activeConversationId={activeConversationId}
          onSelectConversation={setActiveConversationId}
          onNewConversation={handleNewConversation}
        />
        <div
          className={cn(
            "relative flex w-full flex-1 flex-col text-foreground",
            "h-full overflow-x-hidden bg-app-background"
          )}
        >
          {/* AppContentInnerWrapper */}
          <div
            className={cn(
              "my-2 mr-2 rounded-xl flex-1 bg-panel-background border border-border overflow-hidden h-panel",
              !isNavigationBarOpen && "ml-5"
            )}
            style={{
              boxShadow:
                "0 0 0 0.4px rgba(0, 0, 0, 0.02), 0 0 1px 1px rgba(0, 0, 0, 0.02)",
            }}
          >
            {/* The panel scroller: locked on the home stage (wheel intent
                fills the Discover button), free on the discover stage. */}
            <div
              ref={scrollerRef}
              className={cn(
                "relative flex h-panel min-h-0 flex-col [scrollbar-gutter:stable]",
                stage === "discover" ? "overflow-y-auto" : "overflow-y-hidden"
              )}
            >
              {/* AppLayoutTitle: the conversation route has no title bar, so
                  production renders the empty mobile-only spacer. */}
              <div
                className={cn(
                  "h-title",
                  "flex w-full shrink-0 flex-col border-b border-separator px-4 pl-14 md:pl-3",
                  "bg-panel-background",
                  "block md:hidden"
                )}
              />
              <NewConversationHome
                key={heroKey}
                draft={draft}
                onDraftChange={handleDraftChange}
                onTypeDraft={typewriter.type}
                selectedAgent={selectedAgent}
                onSelectAgent={setSelectedAgent}
                selectedSkills={selectedSkills}
                onSelectedSkillsChange={setSelectedSkills}
                onSubmit={handleSubmit}
                fillProgress={fillProgress}
                onDiscoverClick={goToDiscover}
              />
              <DiscoverAgentDiscoverPage
                ref={discoverRef}
                onUseAgent={handleUseAgent}
                onUseSkill={handleUseSkill}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Home page: greeting + centered composer + Discover button ───────────────

function NewConversationHome({
  draft,
  onDraftChange,
  onTypeDraft,
  selectedAgent,
  onSelectAgent,
  selectedSkills,
  onSelectedSkillsChange,
  onSubmit,
  fillProgress,
  onDiscoverClick,
}: {
  draft: string;
  onDraftChange: (draft: string) => void;
  onTypeDraft: (draft: string) => void;
  selectedAgent: Agent | null;
  onSelectAgent: (agent: Agent | null) => void;
  selectedSkills: Skill[];
  onSelectedSkillsChange: (skills: Skill[]) => void;
  onSubmit: (text: string) => void;
  fillProgress: number;
  onDiscoverClick: () => void;
}) {
  const [greeting] = useState(() =>
    getRandomGreetingForName(CURRENT_USER.firstName)
  );
  // Production gates the hero entrance on `useReducedMotion`.
  const reducedMotion = usePrefersReducedMotion();

  return (
    // ConversationContainerVirtuoso empty state, with the composer centered
    // in the panel instead of pinned under the greeting.
    <div className="flex h-panel w-full shrink-0 flex-col items-center px-4 md:px-8">
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center">
        <div
          id="agent-input-header"
          className="flex h-fit w-full max-w-conversation flex-col items-center justify-end gap-4 pb-8 pt-4"
        >
          <Page.Header
            title={
              <h3
                key={greeting}
                className="heading-3xl font-medium text-foreground"
              >
                {greeting.split(" ").map((word, index) => (
                  <span
                    key={`${index}-${word}`}
                    className="inline-block whitespace-pre"
                    style={reducedMotion ? undefined : greetingWordStyle(index)}
                  >
                    {index === 0 ? word : ` ${word}`}
                  </span>
                ))}
              </h3>
            }
          />
        </div>
        <div
          className={cn(
            "flex w-full",
            // px-1 keeps a constant gutter so the card's shadow ring never
            // clips at the scroller edge; max-w compensates so the card
            // still measures exactly --container-conversation when wide.
            "md:w-full md:max-w-[calc(var(--container-conversation)+0.5rem)] md:px-1"
          )}
          style={reducedMotion ? undefined : composerEntranceStyle}
        >
          <DiscoverAgentComposer
            value={draft}
            onChange={onDraftChange}
            selectedAgent={selectedAgent}
            onSelectAgent={onSelectAgent}
            selectedSkills={selectedSkills}
            onSelectedSkillsChange={onSelectedSkillsChange}
            onSubmit={onSubmit}
          />
        </div>
        <SuggestedPrompts
          hidden={draft.trim().length > 0}
          onPick={(prompt) => {
            onTypeDraft(prompt.draft);
            onSelectedSkillsChange([prompt.skill]);
          }}
          style={reducedMotion ? undefined : promptsEntranceStyle}
        />
      </div>
      <div
        className="flex shrink-0 pb-6"
        style={reducedMotion ? undefined : discoverButtonEntranceStyle}
      >
        <DiscoverButton progress={fillProgress} onClick={onDiscoverClick} />
      </div>
    </div>
  );
}

// Starter prompts under the composer: a round skill tile and the prompt.
// Picking one fills the draft and attaches the skill. They collapse as soon
// as the member starts typing (or picks one), and return when the draft is
// cleared.
const promptsEntranceStyle = heroEntranceStyle({
  yPx: 8,
  blurPx: 3,
  durationSeconds: 0.28,
  delaySeconds: 0.22,
});

// Exit: rows leave top-down, each a beat after the previous, rising toward
// the composer that just took focus. The list keeps its height throughout so
// the greeting and composer never move. Enter: rows settle in top-down.
const PROMPT_STAGGER_MS = 35;
const PROMPT_ROW_EXIT_MS = 160; // --transition-duration-exit
const PROMPT_ROW_ENTER_MS = 200; // --transition-duration-enter

function SuggestedPrompts({
  hidden,
  onPick,
  style,
}: {
  hidden: boolean;
  onPick: (prompt: SuggestedPrompt) => void;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden={hidden}
      className={cn(
        "mt-4 w-full max-w-conversation",
        hidden && "pointer-events-none"
      )}
      style={style}
    >
      <ul className="flex flex-col gap-1">
        {SUGGESTED_PROMPTS.map((prompt, index) => (
          <li
            key={prompt.id}
            className={cn(
              "transition-[opacity,translate] ease-enter motion-reduce:transition-none",
              hidden
                ? "-translate-y-2 opacity-0 motion-reduce:translate-y-0"
                : "translate-y-0 opacity-100"
            )}
            style={{
              transitionDuration: `${hidden ? PROMPT_ROW_EXIT_MS : PROMPT_ROW_ENTER_MS}ms`,
              transitionDelay: hidden
                ? `${index * PROMPT_STAGGER_MS}ms`
                : `${index * PROMPT_STAGGER_MS}ms`,
            }}
          >
            <button
              type="button"
              onClick={() => onPick(prompt)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left",
                "transition-colors duration-150 hover:bg-hover motion-reduce:transition-none"
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                  prompt.iconIsLogo
                    ? "bg-muted-background"
                    : "bg-highlight-50 text-highlight-500"
                )}
              >
                <Icon visual={prompt.skill.icon} size="sm" />
              </span>
              <span className="copy-base text-foreground">{prompt.text}</span>
              <span className="sr-only">, uses {prompt.skill.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// A pill whose border draws clockwise with the member's scroll intent.
// Clicking it skips the fill and goes straight to the Discover page.

// Matches `h-9`; the ring is drawn inside the pill's own border.
const DISCOVER_BUTTON_HEIGHT_PX = 36;
const DISCOVER_BUTTON_RING_WIDTH_PX = 1.5;

function DiscoverButton({
  progress,
  onClick,
}: {
  progress: number;
  onClick: () => void;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const isComplete = progress >= 1;
  const inset = DISCOVER_BUTTON_RING_WIDTH_PX / 2;
  const radius = DISCOVER_BUTTON_HEIGHT_PX / 2 - inset;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Discover Skills and agents"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "group relative inline-flex h-9 items-center gap-2 rounded-full pl-3 pr-4",
        "border border-border bg-background text-foreground",
        "shadow-[0px_1px_1px_-0.5px_rgba(0,0,0,0.05),0px_2px_4px_-2px_rgba(0,0,0,0.06)]",
        "transition-[color,background-color,border-color,box-shadow,scale,translate] duration-[160ms] ease-emphasized",
        // Hover lifts a hair and deepens the shadow; pointer devices only.
        "[@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-px",
        "[@media(hover:hover)_and_(pointer:fine)]:hover:shadow-[0px_2px_2px_-1px_rgba(0,0,0,0.06),0px_6px_10px_-4px_rgba(0,0,0,0.10)]",
        // Press feedback: a slight give on click.
        "active:translate-y-0 active:scale-[0.97] motion-reduce:active:scale-100",
        // The ring closing tints the whole pill: the fill became the action.
        isComplete &&
          "border-highlight-200 bg-highlight-50 text-highlight-700 dark:border-highlight-800"
      )}
    >
      {/* `pathLength` normalizes the rounded rect's perimeter to 100, so the
          dash offset is the progress percentage whatever the pill's width. */}
      <svg
        aria-hidden
        // Spans the border box (not the padded content box) so the ring
        // sits exactly on the pill's border.
        className="pointer-events-none absolute -inset-px h-[calc(100%+2px)] w-[calc(100%+2px)] text-blue-500"
        style={{ overflow: "visible" }}
      >
        <rect
          x={inset}
          y={inset}
          width={`calc(100% - ${DISCOVER_BUTTON_RING_WIDTH_PX}px)`}
          height={DISCOVER_BUTTON_HEIGHT_PX - DISCOVER_BUTTON_RING_WIDTH_PX}
          rx={radius}
          ry={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={DISCOVER_BUTTON_RING_WIDTH_PX}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100 - percent}
          style={{
            transition:
              progress === 0
                ? "stroke-dashoffset 300ms cubic-bezier(0.23, 1, 0.32, 1)"
                : "stroke-dashoffset 80ms linear",
          }}
        />
      </svg>
      {/* The spark turns with the ring, a quarter turn by the time it closes. */}
      <span
        aria-hidden
        className={cn(
          "relative flex transition-[color,rotate] motion-reduce:rotate-0",
          isComplete ? "text-highlight-500" : "text-muted-foreground",
          "[@media(hover:hover)_and_(pointer:fine)]:group-hover:text-highlight-500"
        )}
        style={{
          rotate: `${progress * 90}deg`,
          transitionDuration: progress === 0 ? "300ms" : "80ms",
          transitionTimingFunction:
            progress === 0 ? "cubic-bezier(0.23, 1, 0.32, 1)" : "linear",
        }}
      >
        <Icon visual={Stars02} size="xs" />
      </span>
      {/* Label crossfades to "Opening" when the ring closes; a touch of blur
          bridges the two states so they read as one word changing. */}
      <span className="relative grid heading-sm">
        <span
          aria-hidden={isComplete}
          className={cn(
            "col-start-1 row-start-1 transition-[opacity,translate,filter] duration-200 ease-emphasized motion-reduce:transition-opacity",
            isComplete &&
              "-translate-y-1 opacity-0 blur-[2px] motion-reduce:translate-y-0 motion-reduce:blur-none"
          )}
        >
          Discover Skills and agents
        </span>
        <span
          aria-hidden={!isComplete}
          className={cn(
            "col-start-1 row-start-1 transition-[opacity,translate,filter] duration-200 ease-emphasized motion-reduce:transition-opacity",
            !isComplete &&
              "translate-y-1 opacity-0 blur-[2px] motion-reduce:translate-y-0 motion-reduce:blur-none"
          )}
        >
          Opening Discover
        </span>
      </span>
    </button>
  );
}
