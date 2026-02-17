"use client";

import { AcademySearch } from "@app/components/academy/AcademyComponents";
import { TableOfContents } from "@app/components/blog/TableOfContents";
import type { TocItem } from "@app/lib/contentful/tableOfContents";
import type { SearchableItem } from "@app/lib/contentful/types";
import { LinkWrapper } from "@app/lib/platform";
import {
  ArrowLeftIcon,
  Button,
  MenuIcon,
  Sheet,
  SheetContent,
  SheetTitle,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface AcademySidebarProps {
  searchableItems: SearchableItem[];
  tocItems?: TocItem[];
}

function SidebarContent({
  searchableItems,
  tocItems,
  onNavigate,
}: AcademySidebarProps & { onNavigate?: () => void }) {
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

      {tocItems && tocItems.length > 0 && (
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <TableOfContents
            items={tocItems}
            className="static max-h-none [&>h3]:mb-1 [&>h3]:text-xs"
            onItemClick={onNavigate}
          />
        </div>
      )}
    </>
  );
}

export function AcademySidebar({
  searchableItems,
  tocItems = [],
}: AcademySidebarProps) {
  return (
    <div className="sticky top-16 z-40 hidden h-[calc(100vh-4rem)] w-64 flex-col border-r border-gray-200 bg-white lg:flex">
      <SidebarContent searchableItems={searchableItems} tocItems={tocItems} />
    </div>
  );
}

export function MobileMenuButton({
  searchableItems,
  tocItems = [],
}: AcademySidebarProps) {
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
            <SidebarContent
              searchableItems={searchableItems}
              tocItems={tocItems}
              onNavigate={() => setIsOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
