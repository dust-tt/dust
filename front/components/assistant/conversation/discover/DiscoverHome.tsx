import type {
  CatalogItem,
  DiscoverSkill,
} from "@app/components/assistant/conversation/discover/DiscoverCatalog";
import {
  CatalogRow,
  getItemDescription,
  getItemId,
  getItemName,
  ItemAuthor,
  SkillCatalogAvatar,
} from "@app/components/assistant/conversation/discover/DiscoverCatalog";
import type { DiscoverySuggestionSection } from "@app/components/assistant/conversation/discover/discoveryTracking";
import {
  trackDiscoverySuggestionClick,
  trackDiscoverySuggestionView,
} from "@app/components/assistant/conversation/discover/discoveryTracking";
import { getSkillIcon } from "@app/lib/skill";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import {
  useDiscoveryFeatured,
  useDiscoveryForYou,
  useDiscoveryTrending,
} from "@app/lib/swr/discovery";
import { useSkillsWithRelations } from "@app/lib/swr/skill_configurations";
import type { DiscoveryRankedItemType } from "@app/types/api/discovery";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { WorkspaceType } from "@app/types/user";
import {
  Avatar,
  Button,
  ChevronLeft,
  ChevronRight,
  cn,
  EmptyCTA,
  Spinner,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const FEATURED_SLOT_COUNT = 3;
const SECTION_ITEM_COUNT = 4;

const FEATURED_SLOT_CLASSES = "h-56 rounded-2xl border";

const FEATURED_ITEM_CLASSES =
  "w-full shrink-0 snap-start md:w-[calc((100%-2rem)/3)]";

function resolveCatalogItems(
  items: DiscoveryRankedItemType[],
  agentsById: Map<string, LightAgentConfigurationType>,
  skillsById: Map<string, DiscoverSkill>
): CatalogItem[] {
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
        const agent = agentsById.get(target.sId);
        if (agent) {
          resolved.push({ kind: "agent", agent });
        }
        break;
      }
      case "skill": {
        const skill = skillsById.get(target.sId);
        if (skill) {
          resolved.push({ kind: "skill", skill });
        }
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
  onAgentClick: (agent: LightAgentConfigurationType) => void;
  onSkillClick: (skill: DiscoverSkill) => void;
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
  const { agentConfigurations, isLoading: isAgentsLoading } =
    useUnifiedAgentConfigurations({ workspaceId: owner.sId });
  const { skillsWithRelations, isSkillsWithRelationsLoading } =
    useSkillsWithRelations({ owner, status: "active", withUsage: true });
  const { featuredItems, isFeaturedLoading } = useDiscoveryFeatured({
    workspaceId: owner.sId,
  });
  const { forYouItems, isForYouLoading } = useDiscoveryForYou({
    workspaceId: owner.sId,
  });
  const { trendingItems, isTrendingLoading } = useDiscoveryTrending({
    workspaceId: owner.sId,
  });

  const resolve = useCallback(
    (items: DiscoveryRankedItemType[]) => {
      const agentsById = new Map(
        agentConfigurations
          .filter((a) => a.status === "active")
          .map((a) => [a.sId, a])
      );
      const skillsById = new Map(skillsWithRelations.map((s) => [s.sId, s]));
      return resolveCatalogItems(items, agentsById, skillsById);
    },
    [agentConfigurations, skillsWithRelations]
  );

  const isCatalogLoading =
    (isAgentsLoading && agentConfigurations.length === 0) ||
    isSkillsWithRelationsLoading;
  const isCatalogRefreshing = isAgentsLoading && !isCatalogLoading;

  const featured = resolve(featuredItems);
  const forYou = useMemo(
    () => resolve(forYouItems).slice(0, SECTION_ITEM_COUNT),
    [forYouItems, resolve]
  );
  const trending = useMemo(
    () => resolve(trendingItems).slice(0, SECTION_ITEM_COUNT),
    [resolve, trendingItems]
  );

  const onUse = (item: CatalogItem) =>
    item.kind === "agent" ? onAgentClick(item.agent) : onSkillClick(item.skill);

  const isFeaturedLoadingAll = isFeaturedLoading || isCatalogLoading;
  const isFeaturedHidden =
    !onPin && !isFeaturedLoadingAll && featured.length === 0;

  return (
    <>
      {!isFeaturedHidden && (
        <FeaturedCarousel
          items={featured}
          isLoading={isFeaturedLoadingAll}
          isRefreshing={isCatalogRefreshing}
          onUse={onUse}
        />
      )}
      <DiscoverSection
        title="Agent & Skill for you"
        emptyMessage="Recommendations will show up here as you chat with agents and use skills."
        section="for_you"
        items={forYou}
        isLoading={isForYouLoading || isCatalogLoading}
        isRefreshing={isCatalogRefreshing}
        onUse={onUse}
        onPin={onPin}
        onDetails={onDetails}
        onFindMore={onFindMore}
      />
      <DiscoverSection
        title="Trending in the workspace"
        emptyMessage="Trending picks will fill in as usage grows across the workspace."
        section="trending"
        items={trending}
        isLoading={isTrendingLoading || isCatalogLoading}
        isRefreshing={isCatalogRefreshing}
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
  items: CatalogItem[];
  isLoading: boolean;
  isRefreshing: boolean;
  onUse: (item: CatalogItem) => void;
}

function FeaturedCarousel({
  items,
  isLoading,
  isRefreshing,
  onUse,
}: FeaturedCarouselProps) {
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

  const placeholderCount = Math.max(0, FEATURED_SLOT_COUNT - items.length);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <SectionTitle title="Featured" isRefreshing={isRefreshing} />
        {(canScroll.left || canScroll.right) && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="xs"
              icon={ChevronLeft}
              aria-label="Previous featured"
              disabled={!canScroll.left}
              onClick={() => scrollByPage(-1)}
            />
            <Button
              variant="ghost"
              size="xs"
              icon={ChevronRight}
              aria-label="Next featured"
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
          {items.map((item) => (
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
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner />
          </div>
        ) : (
          items.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center px-6">
              <p className="copy-sm text-center text-muted-foreground">
                Nothing featured yet. Pin agents and skills from the list to
                show them here.
              </p>
            </div>
          )
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
  useEffect(() => {
    if (isLoading) {
      return;
    }

    items.forEach((item) => {
      trackDiscoverySuggestionView({
        section,
        itemKind: item.kind,
        itemId: getItemId(item),
      });
    });
  }, [isLoading, items, section]);

  const trackClick = (item: CatalogItem) =>
    trackDiscoverySuggestionClick({
      section,
      itemKind: item.kind,
      itemId: getItemId(item),
    });

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <SectionTitle title={title} isRefreshing={isRefreshing} />
        {!isLoading && items.length > 0 && (
          <Button
            variant="ghost"
            size="xs"
            label="Find more"
            onClick={onFindMore}
          />
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyCTA
          message={emptyMessage}
          action={
            <Button
              variant="outline"
              size="sm"
              label="Browse agents & skills"
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
                trackClick(item);
                onUse(item);
              }}
              onPin={onPin && (() => onPin(item))}
              onDetails={() => {
                trackClick(item);
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
            <SkillBackdrop skill={item.skill} />
            <span className="relative">
              <SkillCatalogAvatar skill={item.skill} size="md" />
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

interface SkillBackdropProps {
  skill: DiscoverSkill;
}

function SkillBackdrop({ skill }: SkillBackdropProps) {
  const SkillIcon = useMemo(() => getSkillIcon(skill.icon), [skill.icon]);
  return (
    <span
      aria-hidden
      className="absolute inset-0 flex items-center justify-center"
    >
      <SkillIcon className="h-full w-full scale-150 opacity-30 blur-xl" />
    </span>
  );
}
