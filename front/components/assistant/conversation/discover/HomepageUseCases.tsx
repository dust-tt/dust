import {
  trackHomepageUseCaseClick,
  trackHomepageUseCaseView,
} from "@app/components/assistant/conversation/discover/discoveryTracking";
import { TYPING_MAX_DURATION_MS } from "@app/components/editor/input_bar/useCustomEditor";
import {
  getIcon,
  ResourceAvatar,
} from "@app/components/resources/resources_icons";
import { useHomepageUseCases } from "@app/lib/swr/homepage_use_cases";
import type {
  HomepageUseCaseTier,
  HomepageUseCaseType,
} from "@app/types/api/homepage_use_cases";
import { MAX_FEATURED_USE_CASES } from "@app/types/api/homepage_use_cases";
import { cn, LoadingBlock } from "@dust-tt/sparkle";
import sampleSize from "lodash/sampleSize";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

const VISIBLE_COUNT = 4;

const TIER_QUOTAS: [HomepageUseCaseTier, number][] = [
  ["featured", MAX_FEATURED_USE_CASES],
  ["milestone", 1],
  ["role", 2],
  ["general", VISIBLE_COUNT],
];

/**
 * @cc [owner:adrsimon,label:react;product] featured-use-cases-come-first
 * Every offered `featured` use case, up to `MAX_FEATURED_USE_CASES`, MUST be in the picked rows and rendered before the
 * others. The remaining rows are drawn from `milestone` (up to 1), then `role` (up to 2), then
 * `general`, and any row still free is filled from what is left, whatever its tier.
 */
function pickUseCases(useCases: HomepageUseCaseType[]): HomepageUseCaseType[] {
  const picked: HomepageUseCaseType[] = [];
  for (const [tier, quota] of TIER_QUOTAS) {
    const candidates = useCases.filter((useCase) => useCase.tier === tier);
    picked.push(
      ...sampleSize(candidates, Math.min(quota, VISIBLE_COUNT - picked.length))
    );
  }

  const leftovers = useCases.filter((useCase) => !picked.includes(useCase));

  return [...picked, ...sampleSize(leftovers, VISIBLE_COUNT - picked.length)];
}

interface HomepageUseCasesProps {
  onPick: (useCase: HomepageUseCaseType) => void;
  style?: CSSProperties;
  workspaceId: string;
}

/**
 * @cc [owner:adrsimon,label:react;product] rows-track-offered-use-cases
 * The rendered rows MUST always be a subset of the use cases the endpoint currently resolves,
 * so a use case whose requirements stopped resolving can no longer be picked. The sample is
 * kept across revalidations only while every row it holds is still offered.
 */
export function HomepageUseCases({
  onPick,
  style,
  workspaceId,
}: HomepageUseCasesProps) {
  const { useCases, isUseCasesLoading } = useHomepageUseCases({ workspaceId });

  const [page, setPage] = useState<HomepageUseCaseType[]>([]);
  const stillOffered = new Set(useCases.map((useCase) => useCase.id));
  const needsInitialSample = page.length === 0 && useCases.length > 0;
  const containsUnavailableUseCase = page.some(
    ({ id }) => !stillOffered.has(id)
  );

  if (needsInitialSample || containsUnavailableUseCase) {
    setPage(pickUseCases(useCases));
  }

  useEffect(() => {
    page.forEach(({ id }) => {
      trackHomepageUseCaseView({ useCaseId: id });
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
      <div className="mt-4 w-full max-w-conversation" style={style}>
        <ul className="flex flex-col gap-1">
          {Array.from({ length: VISIBLE_COUNT }, (_, index) => (
            <li key={index} className="flex h-12 items-center gap-3 px-2">
              <LoadingBlock className="h-9 w-9 shrink-0 rounded-full" />
              <LoadingBlock className="h-4 w-64 max-w-full" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (page.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 w-full max-w-conversation" style={style}>
      <ul className="flex flex-col gap-1">
        {page.map((useCase) => (
          <UseCaseRow
            key={useCase.id}
            isDisabled={isTyping}
            onPick={() => {
              trackHomepageUseCaseClick({ useCaseId: useCase.id });
              setIsTyping(true);
              onPick(useCase);
            }}
            useCase={useCase}
          />
        ))}
      </ul>
    </div>
  );
}

interface UseCaseRowProps {
  isDisabled: boolean;
  onPick: () => void;
  useCase: HomepageUseCaseType;
}

function UseCaseRow({ isDisabled, onPick, useCase }: UseCaseRowProps) {
  return (
    <li className="h-12">
      <button
        type="button"
        disabled={isDisabled}
        onClick={onPick}
        className={cn(
          "flex h-full w-full items-center gap-3 rounded-xl px-2 text-left",
          "transition-[colors,opacity] duration-150 motion-reduce:transition-none",
          isDisabled ? "opacity-50" : "hover:bg-hover"
        )}
      >
        <ResourceAvatar icon={getIcon(useCase.icon)} size="sm" />
        <span className="copy-base text-foreground">{useCase.label}</span>
      </button>
    </li>
  );
}
