"use client";

import {
  AcademySearch,
  ChapterStatusIcons,
} from "@app/components/academy/AcademyComponents";
import { TableOfContents } from "@app/components/blog/TableOfContents";
import type { TocItem } from "@app/lib/contentful/tableOfContents";
import type { ChapterSummary, SearchableItem } from "@app/lib/contentful/types";
import { LinkWrapper } from "@app/lib/platform";
import { classNames } from "@app/lib/utils";
import {
  ArrowLeftIcon,
  Button,
  MenuIcon,
  Sheet,
  SheetContent,
  SheetTitle,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface ChapterSidebarProps {
  searchableItems: SearchableItem[];
  courseSlug: string;
  courseTitle: string;
  chapters: ChapterSummary[];
  activeChapterSlug?: string;
  tocItems?: TocItem[];
  completedChapterSlugs?: string[];
  attemptedChapterSlugs?: string[];
}

function ChapterSidebarContent({
  searchableItems,
  courseSlug,
  courseTitle,
  chapters,
  activeChapterSlug,
  tocItems,
  completedChapterSlugs,
  attemptedChapterSlugs,
  onNavigate,
}: ChapterSidebarProps & { onNavigate?: () => void }) {
  const completedSet = new Set(completedChapterSlugs ?? []);
  const attemptedSet = new Set(attemptedChapterSlugs ?? []);
  return (
    <>
      <div className="flex-shrink-0 border-b border-gray-200 px-3 py-3">
        <LinkWrapper
          href="/academy"
          onClick={onNavigate}
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Academy
        </LinkWrapper>
      </div>
      <div className="flex-shrink-0 px-3 py-3">
        <AcademySearch searchableItems={searchableItems} />
      </div>

      <div className="flex-shrink-0 border-b border-gray-200 px-3 pb-3">
        <LinkWrapper
          href={`/academy/${courseSlug}`}
          onClick={onNavigate}
          className="text-sm font-semibold text-foreground transition-colors hover:text-highlight"
        >
          {courseTitle}
        </LinkWrapper>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <nav className="space-y-1" aria-label="Chapter navigation">
          {chapters.map((chapter, index) => {
            const isActive = chapter.slug === activeChapterSlug;
            const isCompleted = completedSet.has(chapter.slug);

            return (
              <div key={chapter.id}>
                <LinkWrapper
                  href={`/academy/${courseSlug}/chapter/${chapter.slug}`}
                  onClick={onNavigate}
                  className={classNames(
                    "flex items-center gap-1.5 rounded-md border-l-2 px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "border-primary bg-primary/5 font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border hover:bg-gray-50 hover:text-foreground"
                  )}
                >
                  <span className="mr-0.5 flex-shrink-0 text-xs text-muted-foreground">
                    {index + 1}.
                  </span>
                  <span className="flex-1">{chapter.title}</span>
                  <ChapterStatusIcons
                    isRead={attemptedSet.has(chapter.slug)}
                    isQuizPassed={isCompleted}
                  />
                </LinkWrapper>

                {isActive && tocItems && tocItems.length > 0 && (
                  <div className="ml-4 mt-1">
                    <TableOfContents
                      items={tocItems}
                      className="static max-h-none [&>h3]:mb-1 [&>h3]:hidden"
                      onItemClick={onNavigate}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>
    </>
  );
}

export function ChapterSidebar(props: ChapterSidebarProps) {
  return (
    <div className="sticky top-16 z-40 hidden h-[calc(100vh-4rem)] w-72 flex-col border-r border-gray-200 bg-white lg:flex">
      <ChapterSidebarContent {...props} />
    </div>
  );
}

export function ChapterMobileMenuButton(props: ChapterSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        icon={MenuIcon}
        variant="ghost"
        size="sm"
        className="lg:hidden"
        onClick={() => setIsOpen(true)}
        aria-label="Open menu"
      />
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="left" size="md" className="p-0">
          <div className="flex h-full flex-col bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-3 py-3">
              <SheetTitle className="text-base font-semibold">
                Academy
              </SheetTitle>
            </div>
            <ChapterSidebarContent
              {...props}
              onNavigate={() => setIsOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
