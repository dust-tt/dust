import {
  getIcon,
  ResourceAvatar,
} from "@app/components/resources/resources_icons";
import { useHomepageUseCases } from "@app/lib/swr/homepage_use_cases";
import type { HomepageUseCaseType } from "@app/types/api/homepage_use_cases";
import { cn, LoadingBlock } from "@dust-tt/sparkle";
import sampleSize from "lodash/sampleSize";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

const VISIBLE_COUNT = 4;

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

  useEffect(() => {
    setPage((current) => {
      const stillOffered = new Set(useCases.map((useCase) => useCase.id));
      if (
        current.length > 0 &&
        current.every((useCase) => stillOffered.has(useCase.id))
      ) {
        return current;
      }

      return sampleSize(useCases, VISIBLE_COUNT);
    });
  }, [useCases]);

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
            onPick={() => onPick(useCase)}
            useCase={useCase}
          />
        ))}
      </ul>
    </div>
  );
}

interface UseCaseRowProps {
  onPick: () => void;
  useCase: HomepageUseCaseType;
}

function UseCaseRow({ onPick, useCase }: UseCaseRowProps) {
  return (
    <li className="h-12">
      <button
        type="button"
        onClick={onPick}
        className={cn(
          "flex h-full w-full items-center gap-3 rounded-xl px-2 text-left",
          "transition-colors duration-150 hover:bg-hover motion-reduce:transition-none"
        )}
      >
        <ResourceAvatar icon={getIcon(useCase.icon)} size="sm" />
        <span className="copy-base text-foreground">{useCase.label}</span>
      </button>
    </li>
  );
}
