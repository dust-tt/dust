import type { CatalogItem } from "@app/components/assistant/conversation/discover/catalog";
import {
  getItemDescription,
  getItemId,
  getItemName,
} from "@app/components/assistant/conversation/discover/catalog";
import {
  CatalogRow,
  CatalogRowsSkeleton,
  ItemAuthor,
  SkillCatalogAvatar,
} from "@app/components/assistant/conversation/discover/DiscoverCatalog";
import type { DiscoverySuggestionSection } from "@app/components/assistant/conversation/discover/discoveryTracking";
import {
  trackDiscoverItemDetailsOpen,
  trackDiscoverItemSelect,
} from "@app/components/assistant/conversation/discover/discoveryTracking";
import type { PendingSkill } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { getSkillIcon, isDustProvidedSkill } from "@app/lib/skill";
import {
  useDiscoveryFeatured,
  useDiscoveryForYou,
  useDiscoveryTrending,
} from "@app/lib/swr/discovery";
import type { DiscoveryRankedItemType } from "@app/types/api/discovery";
import type { RichAgentMentionCandidate } from "@app/types/assistant/mentions";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { WorkspaceType } from "@app/types/user";
import {
  Avatar,
  Button,
  ChevronLeft,
  ChevronRight,
  cn,
  EmptyCTA,
  LoadingBlock,
  Spinner,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const FEATURED_SLOT_COUNT = 3;
const SECTION_ITEM_COUNT = 4;

const FEATURED_SLOT_CLASSES = "h-56 rounded-2xl border";

const FEATURED_ITEM_CLASSES =
  "w-full shrink-0 snap-start md:w-[calc((100%-2rem)/3)]";

function resolveCatalogItems(items: DiscoveryRankedItemType[]): CatalogItem[] {
  const seen = new Set<string>();
  const resolved: CatalogItem[] = [];
  for (const { type, target } of items) {
    const key = `${type}-${target.sId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    switch (type) {
      case "agent": {
        resolved.push({
          kind: "agent",
          agent: target,
          authors: target.lastAuthors,
          isDustProvided: target.scope === "global",
          activeUsersCount: null,
          isFavorite: null,
        });
        break;
      }
      case "skill": {
        resolved.push({
          kind: "skill",
          skill: {
            sId: target.sId,
            name: target.name,
            icon: target.icon,
            userFacingDescription: target.description,
          },
          authors: target.editors,
          isDustProvided: isDustProvidedSkill(target),
          activeUsersCount: null,
          isFavorite: null,
        });
        break;
      }
      default:
        assertNeverAndIgnore(type);
    }
  }
  return resolved;
}

interface DiscoverHomeProps {
  owner: WorkspaceType;
  onAgentClick: (agent: RichAgentMentionCandidate) => void;
  onSkillClick: (skill: PendingSkill) => void;
  onPin?: (item: CatalogItem) => void;
  onDetails: (item: CatalogItem) => void;
  onFindMore: () => void;
}

export function DiscoverHome({
  owner,
  onAgentClick,
  onSkillClick,
  onPin,
  onDetails,
  onFindMore,
}: DiscoverHomeProps) {
  const { t } = useLingui();
  const { featuredItems, isFeaturedLoading, isFeaturedRefreshing } =
    useDiscoveryFeatured({
      workspaceId: owner.sId,
    });
  const { forYouItems, isForYouLoading, isForYouRefreshing } =
    useDiscoveryForYou({
      workspaceId: owner.sId,
    });
  const { trendingItems, isTrendingLoading, isTrendingRefreshing } =
    useDiscoveryTrending({
      workspaceId: owner.sId,
    });

  const featured = resolveCatalogItems(featuredItems);
  const forYou = useMemo(
    () => resolveCatalogItems(forYouItems).slice(0, SECTION_ITEM_COUNT),
    [forYouItems]
  );
  const trending = useMemo(
    () => resolveCatalogItems(trendingItems).slice(0, SECTION_ITEM_COUNT),
    [trendingItems]
  );

  const onUse = (item: CatalogItem) =>
    item.kind === "agent" ? onAgentClick(item.agent) : onSkillClick(item.skill);

  const isFeaturedHidden =
    !onPin && !isFeaturedLoading && featured.length === 0;
  const workspaceName = owner.name;

  return (
    <>
      {!isFeaturedHidden && (
        <FeaturedCarousel
          title={t`Curated by ${workspaceName}`}
          items={featured}
          isLoading={isFeaturedLoading}
          isRefreshing={isFeaturedRefreshing}
          onUse={(item) => {
            trackDiscoverItemSelect({ source: "featured", item });
            onUse(item);
          }}
        />
      )}
      <DiscoverSection
        title={t`Agent & skill for you`}
        emptyMessage={t`Recommendations will show up here as you chat with agents and use skills.`}
        section="for_you"
        items={forYou}
        isLoading={isForYouLoading}
        isRefreshing={isForYouRefreshing}
        onUse={onUse}
        onPin={onPin}
        onDetails={onDetails}
        onFindMore={onFindMore}
      />
      <DiscoverSection
        title={t`Trending in the workspace`}
        emptyMessage={t`Trending picks will fill in as usage grows across the workspace.`}
        section="trending"
        items={trending}
        isLoading={isTrendingLoading}
        isRefreshing={isTrendingRefreshing}
        onUse={onUse}
        onPin={onPin}
        onDetails={onDetails}
        onFindMore={onFindMore}
      />
    </>
  );
}

interface SectionTitleProps {
  title: string;
  isRefreshing: boolean;
}

function SectionTitle({ title, isRefreshing }: SectionTitleProps) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="heading-lg text-foreground">{title}</h2>
      {isRefreshing && <Spinner size="xs" />}
    </div>
  );
}

interface FeaturedCarouselProps {
  title: string;
  items: CatalogItem[];
  isLoading: boolean;
  isRefreshing: boolean;
  onUse: (item: CatalogItem) => void;
}

function FeaturedCarousel({
  title,
  items,
  isLoading,
  isRefreshing,
  onUse,
}: FeaturedCarouselProps) {
  const { t } = useLingui();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  const updateCanScroll = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    const left = scroller.scrollLeft > 0;
    const right =
      scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1;
    setCanScroll((current) =>
      current.left === left && current.right === right
        ? current
        : { left, right }
    );
  }, []);

  useEffect(() => {
    updateCanScroll();
  });

  useEffect(() => {
    window.addEventListener("resize", updateCanScroll);
    return () => window.removeEventListener("resize", updateCanScroll);
  }, [updateCanScroll]);

  const scrollByPage = (direction: -1 | 1) => {
    const scroller = scrollerRef.current;
    scroller?.scrollBy({
      left: direction * scroller.clientWidth,
      behavior: "smooth",
    });
  };

  const placeholderCount = isLoading
    ? 0
    : Math.max(0, FEATURED_SLOT_COUNT - items.length);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <SectionTitle title={title} isRefreshing={isRefreshing} />
        {(canScroll.left || canScroll.right) && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="xs"
              icon={ChevronLeft}
              aria-label={t`Previous featured`}
              disabled={!canScroll.left}
              onClick={() => scrollByPage(-1)}
            />
            <Button
              variant="ghost"
              size="xs"
              icon={ChevronRight}
              aria-label={t`Next featured`}
              disabled={!canScroll.right}
              onClick={() => scrollByPage(1)}
            />
          </div>
        )}
      </div>
      <div className="relative">
        <div
          ref={scrollerRef}
          onScroll={updateCanScroll}
          className="scrollbar-hide flex snap-x snap-mandatory gap-4 overflow-x-auto"
        >
          {isLoading
            ? Array.from({ length: FEATURED_SLOT_COUNT }, (_, slot) => (
                <div
                  key={`skeleton-${slot}`}
                  aria-hidden
                  className={FEATURED_ITEM_CLASSES}
                >
                  <FeaturedCardSkeleton />
                </div>
              ))
            : items.map((item) => (
                <div
                  key={`${item.kind}-${getItemId(item)}`}
                  className={FEATURED_ITEM_CLASSES}
                >
                  <FeaturedCard item={item} onClick={() => onUse(item)} />
                </div>
              ))}
          {Array.from({ length: placeholderCount }, (_, slot) => (
            <div
              key={`slot-${slot}`}
              aria-hidden
              className={cn(
                FEATURED_ITEM_CLASSES,
                FEATURED_SLOT_CLASSES,
                "border-dashed border-border-dark bg-muted-background"
              )}
            />
          ))}
        </div>
        {!isLoading && items.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <p className="copy-sm text-center text-muted-foreground">
              <Trans>
                Nothing featured yet. Pin agents and skills from the list to
                show them here.
              </Trans>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

interface DiscoverSectionProps {
  title: string;
  emptyMessage: string;
  section: DiscoverySuggestionSection;
  items: CatalogItem[];
  isLoading: boolean;
  isRefreshing: boolean;
  onUse: (item: CatalogItem) => void;
  onPin?: (item: CatalogItem) => void;
  onDetails: (item: CatalogItem) => void;
  onFindMore: () => void;
}

function DiscoverSection({
  title,
  emptyMessage,
  section,
  items,
  isLoading,
  isRefreshing,
  onUse,
  onPin,
  onDetails,
  onFindMore,
}: DiscoverSectionProps) {
  const { t } = useLingui();
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <SectionTitle title={title} isRefreshing={isRefreshing} />
        {!isLoading && items.length > 0 && (
          <Button
            variant="ghost"
            size="xs"
            label={t`Find more`}
            onClick={onFindMore}
          />
        )}
      </div>
      {isLoading ? (
        <CatalogRowsSkeleton count={SECTION_ITEM_COUNT} />
      ) : items.length === 0 ? (
        <EmptyCTA
          message={emptyMessage}
          action={
            <Button
              variant="outline"
              size="sm"
              label={t`Browse agents & skills`}
              onClick={onFindMore}
            />
          }
        />
      ) : (
        <div className="flex flex-col">
          {items.map((item) => (
            <CatalogRow
              key={`${item.kind}-${getItemId(item)}`}
              item={item}
              onUse={() => {
                trackDiscoverItemSelect({ source: section, item });
                onUse(item);
              }}
              onPin={onPin && (() => onPin(item))}
              onDetails={() => {
                trackDiscoverItemDetailsOpen({ source: section, item });
                onDetails(item);
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface FeaturedCardProps {
  item: CatalogItem;
  onClick: () => void;
}

function FeaturedCard({ item, onClick }: FeaturedCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        FEATURED_SLOT_CLASSES,
        "flex w-full flex-col overflow-hidden border-border bg-background text-left",
        "transition-transform duration-200 ease-emphasized hover:-translate-y-0.5"
      )}
    >
      <div className="relative flex h-32 w-full shrink-0 items-center justify-center overflow-hidden bg-muted-background">
        {item.kind === "agent" ? (
          <>
            <img
              src={item.agent.pictureUrl}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-xl"
            />
            <Avatar
              size="md"
              visual={item.agent.pictureUrl}
              className="relative"
            />
          </>
        ) : (
          <>
            <SkillBackdrop icon={item.skill.icon} />
            <span className="relative">
              <SkillCatalogAvatar icon={item.skill.icon} size="md" />
            </span>
          </>
        )}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 px-4 py-3">
        <span className="flex min-w-0 items-center gap-2 copy-sm">
          <span className="heading-base notranslate truncate text-foreground">
            {getItemName(item)}
          </span>
          <ItemAuthor item={item} />
        </span>
        <span className="copy-sm line-clamp-2 text-muted-foreground">
          {getItemDescription(item)}
        </span>
      </div>
    </button>
  );
}

function FeaturedCardSkeleton() {
  return (
    <div
      className={cn(
        FEATURED_SLOT_CLASSES,
        "flex w-full flex-col overflow-hidden border-border bg-background"
      )}
    >
      <div className="flex h-32 w-full shrink-0 items-center justify-center bg-muted-background">
        <LoadingBlock className="h-12 w-12 rounded-xl" />
      </div>
      <div className="flex flex-col gap-1 px-4 py-3">
        <div className="flex h-6 items-center">
          <LoadingBlock className="h-4 w-32" />
        </div>
        <div className="flex flex-col">
          <div className="flex h-5 items-center">
            <LoadingBlock className="h-3 w-full" />
          </div>
          <div className="flex h-5 items-center">
            <LoadingBlock className="h-3 w-2/3" />
          </div>
        </div>
      </div>
    </div>
  );
}

interface SkillBackdropProps {
  icon: string | null;
}

function SkillBackdrop({ icon }: SkillBackdropProps) {
  const SkillIcon = useMemo(() => getSkillIcon(icon), [icon]);
  return (
    <span
      aria-hidden
      className="absolute inset-0 flex items-center justify-center"
    >
      <SkillIcon className="h-full w-full scale-150 opacity-30 blur-xl" />
    </span>
  );
}
