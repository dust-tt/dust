import {
  trackHomepageUseCaseClick,
  trackHomepageUseCaseDismiss,
  trackHomepageUseCaseView,
} from "@app/components/assistant/conversation/discover/discoveryTracking";
import { TYPING_MAX_DURATION_MS } from "@app/components/editor/input_bar/useCustomEditor";
import {
  getIcon,
  ResourceAvatar,
} from "@app/components/resources/resources_icons";
import {
  useDismissHomepageUseCase,
  useHomepageUseCases,
} from "@app/hooks/useHomepageUseCases";
import type {
  HomepageUseCaseTier,
  HomepageUseCaseType,
} from "@app/types/api/homepage_use_cases";
import { MAX_FEATURED_USE_CASES } from "@app/types/api/homepage_use_cases";
import {
  Button,
  cn,
  LoadingBlock,
  MOTION_EASINGS,
  XClose,
} from "@dust-tt/sparkle";
import type { TargetAndTransition, Variants } from "framer-motion";
import {
  AnimatePresence,
  domMax,
  LazyMotion,
  m,
  useReducedMotion,
} from "framer-motion";
import sampleSize from "lodash/sampleSize";
import { forwardRef, useEffect, useRef, useState } from "react";

const VISIBLE_COUNT = 4;

const ROW_OFFSET_PX = 12;
const ROW_STAGGER_SECONDS = 0.05;

const rowVariants: Variants = {
  hidden: { opacity: 0, x: -ROW_OFFSET_PX, filter: "blur(2px)" },
  visible: {
    opacity: 1,
    x: 0,
    filter: "blur(0px)",
    transition: { duration: 0.28, ease: MOTION_EASINGS.emphasized },
  },
};

const ROW_LAYOUT_TRANSITION = {
  duration: 0.28,
  ease: MOTION_EASINGS.move,
};

// An object rather than a variant label: a label would make the row control its own variants and
// skip the list's staggered entrance.
const ROW_EXIT: TargetAndTransition = {
  pointerEvents: "none",
  opacity: 0,
  x: ROW_OFFSET_PX,
  filter: "blur(2px)",
  transition: { duration: 0.2, ease: MOTION_EASINGS.enter },
};

const TIER_QUOTAS: [HomepageUseCaseTier, number][] = [
  ["featured", MAX_FEATURED_USE_CASES],
  ["milestone", 1],
  ["role", 2],
  ["general", VISIBLE_COUNT],
];

/**
 * @cc [owner:adrsimon,label:react;product] featured-use-cases-come-first
 * Every offered `featured` use case, up to `MAX_FEATURED_USE_CASES`, MUST be in the picked rows
 * and rendered before the others. The remaining rows are drawn from `milestone` (up to 1), then
 * `role` (up to 2), then `general`, and any row still free is filled from what is left, whatever
 * its tier.
 */
function pickUseCases(useCases: HomepageUseCaseType[]): HomepageUseCaseType[] {
  const picked: HomepageUseCaseType[] = [];
  for (const [tier, quota] of TIER_QUOTAS) {
    const candidates = useCases.filter((useCase) => useCase.tier === tier);
    picked.push(
      ...sampleSize(candidates, Math.min(quota, VISIBLE_COUNT - picked.length))
    );
  }

  const pickedIds = new Set(picked.map(({ id }) => id));
  const leftovers = useCases.filter(({ id }) => !pickedIds.has(id));

  return [...picked, ...sampleSize(leftovers, VISIBLE_COUNT - picked.length)];
}

function refillPage(
  page: HomepageUseCaseType[],
  useCases: HomepageUseCaseType[]
): HomepageUseCaseType[] {
  const offeredIds = new Set(useCases.map(({ id }) => id));
  const pageIds = new Set(page.map(({ id }) => id));
  const replacements = pickUseCases(
    useCases.filter(({ id }) => !pageIds.has(id))
  );

  return page.flatMap((row) => {
    if (offeredIds.has(row.id)) {
      return [row];
    }
    const replacement = replacements.shift();

    return replacement ? [replacement] : [];
  });
}

interface HomepageUseCasesProps {
  enterDelaySeconds: number;
  onPick: (useCase: HomepageUseCaseType) => void;
  workspaceId: string;
}

/**
 * @cc [owner:adrsimon,label:react;product] rows-track-offered-use-cases
 * The rendered rows MUST always be a subset of the use cases the endpoint currently resolves,
 * so a use case whose requirements stopped resolving, or that was dismissed, can no longer be
 * picked. When an offered `featured` use case is missing, the rows MUST be resampled. Otherwise a
 * row that is no longer offered MUST be replaced in its own slot, and every row still offered MUST
 * keep its position.
 */
export function HomepageUseCases({
  enterDelaySeconds,
  onPick,
  workspaceId,
}: HomepageUseCasesProps) {
  const { useCases, isUseCasesLoading } = useHomepageUseCases({ workspaceId });
  const shouldReduceMotion = useReducedMotion();
  // Rows that replace the skeleton follow it straight away; rows shown on mount wait for the hero.
  const [rowsDelaySeconds] = useState(
    isUseCasesLoading ? 0 : enterDelaySeconds
  );
  const dismissUseCase = useDismissHomepageUseCase({ workspaceId });

  const [page, setPage] = useState<HomepageUseCaseType[]>([]);
  const stillOffered = new Set(useCases.map((useCase) => useCase.id));
  const needsInitialSample = page.length === 0 && useCases.length > 0;
  const keptRows = page.filter(({ id }) => stillOffered.has(id));
  const pageIds = new Set(page.map(({ id }) => id));
  const missesFeaturedUseCase = useCases.some(
    ({ id, tier }) => tier === "featured" && !pageIds.has(id)
  );

  if (needsInitialSample || missesFeaturedUseCase) {
    setPage(pickUseCases(useCases));
  } else if (keptRows.length < page.length) {
    setPage(refillPage(page, useCases));
  }

  const viewedUseCaseIds = useRef(new Set<string>());

  useEffect(() => {
    page.forEach(({ id }) => {
      if (!viewedUseCaseIds.current.has(id)) {
        viewedUseCaseIds.current.add(id);
        trackHomepageUseCaseView({ useCaseId: id });
      }
    });
  }, [page]);

  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (!isTyping) {
      return;
    }

    const timer = window.setTimeout(
      () => setIsTyping(false),
      TYPING_MAX_DURATION_MS
    );

    return () => window.clearTimeout(timer);
  }, [isTyping]);

  const isPreparing =
    isUseCasesLoading || (useCases.length > 0 && page.length === 0);

  if (isPreparing) {
    return (
      <LazyMotion features={domMax}>
        <m.div
          className="mt-4 w-full max-w-conversation"
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: 0.28,
            ease: MOTION_EASINGS.emphasized,
            delay: enterDelaySeconds,
          }}
        >
          <ul className="flex flex-col gap-1">
            {Array.from({ length: VISIBLE_COUNT }, (_, index) => (
              <li key={index} className="flex h-12 items-center gap-3 px-2">
                <LoadingBlock className="h-9 w-9 shrink-0 rounded-full" />
                <LoadingBlock className="h-4 w-64 max-w-full" />
              </li>
            ))}
          </ul>
        </m.div>
      </LazyMotion>
    );
  }

  if (page.length === 0) {
    return null;
  }

  return (
    <LazyMotion features={domMax}>
      <div className="mt-4 w-full max-w-conversation">
        <m.ul
          className="relative flex flex-col gap-1"
          initial={shouldReduceMotion ? false : "hidden"}
          animate="visible"
          variants={{
            visible: {
              transition: {
                delayChildren: rowsDelaySeconds,
                staggerChildren: ROW_STAGGER_SECONDS,
              },
            },
          }}
        >
          <AnimatePresence mode="popLayout">
            {page.map((useCase) => (
              <UseCaseRow
                key={useCase.id}
                isMotionReduced={!!shouldReduceMotion}
                isDisabled={isTyping}
                onDismiss={() => {
                  trackHomepageUseCaseDismiss({ useCaseId: useCase.id });
                  return dismissUseCase(useCase.id);
                }}
                onPick={() => {
                  trackHomepageUseCaseClick({ useCaseId: useCase.id });
                  setIsTyping(true);
                  onPick(useCase);
                }}
                useCase={useCase}
              />
            ))}
          </AnimatePresence>
        </m.ul>
      </div>
    </LazyMotion>
  );
}

interface UseCaseRowProps {
  isDisabled: boolean;
  isMotionReduced: boolean;
  onDismiss: () => Promise<void>;
  onPick: () => void;
  useCase: HomepageUseCaseType;
}

const UseCaseRow = forwardRef<HTMLLIElement, UseCaseRowProps>(
  function UseCaseRow(
    { isDisabled, isMotionReduced, onDismiss, onPick, useCase },
    ref
  ) {
    const [isDismissing, setIsDismissing] = useState(false);

    return (
      <m.li
        ref={ref}
        layout={!isMotionReduced}
        variants={isMotionReduced ? undefined : rowVariants}
        exit={isMotionReduced ? undefined : ROW_EXIT}
        transition={{ layout: ROW_LAYOUT_TRANSITION }}
      >
        <div
          className={cn(
            "group flex h-12 items-center gap-1 rounded-xl pr-2",
            "transition-[colors,opacity] duration-150 motion-reduce:transition-none",
            isDisabled ? "opacity-50" : "hover:bg-hover"
          )}
        >
          <button
            type="button"
            disabled={isDisabled || isDismissing}
            onClick={onPick}
            className="flex h-full min-w-0 flex-1 items-center gap-3 px-2 text-left"
          >
            <ResourceAvatar icon={getIcon(useCase.icon)} size="sm" />
            <span className="copy-base truncate text-foreground">
              {useCase.label}
            </span>
          </button>
          {useCase.isDismissible && (
            <Button
              variant="ghost-secondary"
              size="xs"
              icon={XClose}
              tooltip="Hide this suggestion"
              aria-label="Hide this suggestion"
              className={cn(
                "group-hover:opacity-100 focus-visible:opacity-100",
                !isDismissing && "opacity-0"
              )}
              isLoading={isDismissing}
              disabled={isDisabled || isDismissing}
              onClick={async () => {
                setIsDismissing(true);
                await onDismiss();
                setIsDismissing(false);
              }}
            />
          )}
        </div>
      </m.li>
    );
  }
);
