import { getSkillAvatarIcon } from "@app/lib/skill";
import { useMentionSuggestions } from "@app/lib/swr/mentions";
import { classNames } from "@app/lib/utils";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { DUST_AVATAR_URL } from "@app/types/assistant/avatar";
import { Avatar, MOTION_EASINGS } from "@dust-tt/sparkle";
import type { MotionValue } from "framer-motion";
import {
  animate,
  domAnimation,
  LazyMotion,
  m,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import sampleSize from "lodash/sampleSize";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";

const TEASER_ITEM_COUNT = 4;

const DISC_SIZE_PX = 36;
const DISC_GAP_PX = 6;
const HOVER_PEEK_PX = DISC_SIZE_PX / 3;
const APEX_PEEK_PX = DISC_SIZE_PX + 2;

const PULL_LIFT_THRESHOLDS = [0.05, 0.4, 0.7, 0.9];

const WAVE_SPREAD_PX = 40;
const WAVE_SPRING = { stiffness: 700, damping: 35 };

const POINTER_AWAY = Number.POSITIVE_INFINITY;

const INTRO_SWEEP_DELAY_SECONDS = 0.7;
const INTRO_SWEEP_SECONDS = 0.7;

type TeaserItem =
  | { kind: "agent"; id: string; name: string; pictureUrl: string }
  | { kind: "skill"; id: string; name: string; icon: string };

const DEFAULT_TEASER_ITEMS: TeaserItem[] = [
  {
    kind: "agent",
    id: GLOBAL_AGENTS_SID.DUST,
    name: "Dust",
    pictureUrl: DUST_AVATAR_URL,
  },
  {
    kind: "skill",
    id: "frames",
    name: "Create Frames",
    icon: "ActionFrameIcon",
  },
  { kind: "skill", id: "go-deep", name: "Go Deep", icon: "ActionAtomIcon" },
  {
    kind: "skill",
    id: "sandbox",
    name: "Computer",
    icon: "TerminalSquareIcon",
  },
];

function discCenterXPx(index: number) {
  return (index - (TEASER_ITEM_COUNT - 1) / 2) * (DISC_SIZE_PX + DISC_GAP_PX);
}

const INTRO_SWEEP_FROM_PX = discCenterXPx(0) - WAVE_SPREAD_PX;
const INTRO_SWEEP_TO_PX = discCenterXPx(TEASER_ITEM_COUNT - 1) + WAVE_SPREAD_PX;

interface TeaserAvatarProps {
  item: TeaserItem;
}

function TeaserAvatar({ item }: TeaserAvatarProps) {
  if (item.kind === "agent") {
    return <Avatar size="sm" name={item.name} visual={item.pictureUrl} />;
  }
  const SkillAvatar = getSkillAvatarIcon(item.icon);
  return <SkillAvatar size="sm" name={item.name} />;
}

interface TeaserDiscProps {
  item: TeaserItem;
  index: number;
  pointerXPx: MotionValue<number>;
  pullProgress: MotionValue<number>;
}

function TeaserDisc({
  item,
  index,
  pointerXPx,
  pullProgress,
}: TeaserDiscProps) {
  const centerXPx = discCenterXPx(index);
  const waveY = useSpring(
    useTransform([pointerXPx, pullProgress], ([x, pull]: number[]) => {
      const distancePx = x - centerXPx;
      const closeness = Math.exp(
        -(distancePx * distancePx) / (2 * WAVE_SPREAD_PX ** 2)
      );
      const wavePeekPx = Number.isFinite(x)
        ? HOVER_PEEK_PX + (APEX_PEEK_PX - HOVER_PEEK_PX) * closeness
        : 0;
      const pullPeekPx = pull >= PULL_LIFT_THRESHOLDS[index] ? APEX_PEEK_PX : 0;
      return -Math.max(wavePeekPx, pullPeekPx);
    }),
    WAVE_SPRING
  );

  return (
    <m.div
      className="absolute top-0 rounded-xl shadow-sm"
      style={{
        left: `calc(50% + ${centerXPx - DISC_SIZE_PX / 2}px)`,
        y: waveY,
      }}
    >
      <TeaserAvatar item={item} />
    </m.div>
  );
}

interface DiscoverButtonTeaserProps {
  workspaceId: string;
  pullProgress: MotionValue<number>;
  children: ReactNode;
}

export function DiscoverButtonTeaser({
  workspaceId,
  pullProgress,
  children,
}: DiscoverButtonTeaserProps) {
  const shouldReduceMotion = useReducedMotion();
  const { suggestions, isLoading } = useMentionSuggestions({
    workspaceId,
    conversationId: null,
    select: { agents: true, users: false },
  });
  const pointerXPx = useMotionValue(POINTER_AWAY);
  const introSweepRef = useRef<ReturnType<typeof animate> | null>(null);
  const items = useMemo(() => {
    const favorites: TeaserItem[] = sampleSize(
      suggestions.filter((m) => m.type === "agent" && m.userFavorite),
      TEASER_ITEM_COUNT
    ).map((m) => ({
      kind: "agent",
      id: m.id,
      name: m.label,
      pictureUrl: m.pictureUrl,
    }));
    return [
      ...favorites,
      ...DEFAULT_TEASER_ITEMS.filter(
        (d) => !favorites.some((f) => f.id === d.id)
      ),
    ].slice(0, TEASER_ITEM_COUNT);
  }, [suggestions]);

  useEffect(() => {
    if (isLoading || shouldReduceMotion) {
      return;
    }
    const timeout = setTimeout(() => {
      pointerXPx.set(INTRO_SWEEP_FROM_PX);
      introSweepRef.current = animate(pointerXPx, INTRO_SWEEP_TO_PX, {
        duration: INTRO_SWEEP_SECONDS,
        ease: MOTION_EASINGS.move,
        onComplete: () => pointerXPx.set(POINTER_AWAY),
      });
    }, INTRO_SWEEP_DELAY_SECONDS * 1000);
    return () => {
      clearTimeout(timeout);
      introSweepRef.current?.stop();
    };
  }, [isLoading, shouldReduceMotion, pointerXPx]);

  return (
    <div
      className="group/teaser relative"
      onPointerMove={(e) => {
        if (shouldReduceMotion || e.pointerType !== "mouse") {
          return;
        }
        introSweepRef.current?.stop();
        const rect = e.currentTarget.getBoundingClientRect();
        pointerXPx.set(e.clientX - rect.left - rect.width / 2);
      }}
      onPointerLeave={() => pointerXPx.set(POINTER_AWAY)}
    >
      <div
        aria-hidden
        className={classNames(
          "pointer-events-none absolute inset-0 [clip-path:inset(-100vh_-100vw_0_-100vw)]",
          "transition-[scale] duration-[160ms] ease-emphasized",
          "group-active/teaser:scale-[0.92] motion-reduce:group-active/teaser:scale-100"
        )}
      >
        <LazyMotion features={domAnimation}>
          {items.map((item, index) => (
            <TeaserDisc
              key={item.id}
              item={item}
              index={index}
              pointerXPx={pointerXPx}
              pullProgress={pullProgress}
            />
          ))}
        </LazyMotion>
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}
