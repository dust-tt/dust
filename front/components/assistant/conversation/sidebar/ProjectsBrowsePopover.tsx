import { InfiniteScroll } from "@app/components/InfiniteScroll";
import { useSearchProjects } from "@app/hooks/useSearchProjects";
import { useAppRouter } from "@app/lib/platform";
import { getSpaceIcon } from "@app/lib/spaces";
import { getProjectRoute } from "@app/lib/utils/router";
import type { ProjectType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  Icon,
  LoadingBlock,
  MoreIcon,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  SearchInput,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface ProjectsBrowsePopoverProps {
  owner: WorkspaceType;
}

interface ProjectBrowseItemProps {
  space: ProjectType;
  onClick: () => void;
}

function ProjectBrowseItemSkeleton({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={`project-skeleton-${i}`}
          className="flex items-start gap-2 p-2"
        >
          <LoadingBlock className="mt-0.5 h-4 w-4 rounded" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <LoadingBlock className="h-4 w-[70%]" />
          </div>
        </div>
      ))}
    </>
  );
}

function ProjectBrowseItem({ space, onClick }: ProjectBrowseItemProps) {
  return (
    <div
      className="flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-muted-background dark:hover:bg-muted-background-night"
      onClick={onClick}
    >
      <Icon
        visual={getSpaceIcon(space)}
        size="sm"
        className="mt-0.5 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{space.name}</div>
        {space.description && (
          <Tooltip
            label={space.description}
            tooltipTriggerAsChild
            trigger={
              <div className="truncate text-xs text-muted-foreground dark:text-muted-foreground-night">
                {space.description}
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}

export function ProjectsBrowsePopover({ owner }: ProjectsBrowsePopoverProps) {
  const router = useAppRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { projects, isSearching, hasMore, loadMore, isLoadingMore } =
    useSearchProjects({
      workspaceId: owner.sId,
      query: searchQuery,
      enabled: isOpen,
      limit: 50,
    });

  const filteredProjects = useMemo(() => {
    return projects.filter(({ isMember }) => !isMember);
  }, [projects]);

  return (
    <div className="hidden sm:block">
      <PopoverRoot open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button size="xs" icon={MoreIcon} variant="ghost" />
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="p-3 pb-2">
            <SearchInput
              name="browse-projects-search"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={setSearchQuery}
            />
          </div>
          <div className="max-h-[40rem] overflow-y-auto px-2 pb-2">
            {isSearching && filteredProjects.length === 0 ? (
              <ProjectBrowseItemSkeleton count={5} />
            ) : filteredProjects.length === 0 ? (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground dark:text-muted-foreground-night">
                No projects found
              </div>
            ) : (
              <>
                {filteredProjects.map((project) => (
                  <ProjectBrowseItem
                    key={project.sId}
                    space={project}
                    onClick={async () => {
                      setIsOpen(false);
                      setSearchQuery("");
                      await router.push(
                        getProjectRoute(owner.sId, project.sId)
                      );
                    }}
                  />
                ))}
                <InfiniteScroll
                  nextPage={loadMore}
                  hasMore={hasMore}
                  showLoader={isLoadingMore}
                  loader={
                    <div className="flex justify-center py-2">
                      <Spinner size="xs" />
                    </div>
                  }
                />
              </>
            )}
          </div>
        </PopoverContent>
      </PopoverRoot>
    </div>
  );
}
