"use client";

import { ArrowLeftIcon } from "@dust-tt/sparkle";
import Image from "next/image";
import Link from "next/link";

import { AcademySearch } from "@app/components/academy/AcademyComponents";
import { TableOfContents } from "@app/components/blog/TableOfContents";
import { contentfulImageLoader } from "@app/lib/contentful/imageLoader";
import type { TocItem } from "@app/lib/contentful/tableOfContents";
import type { BlogImage, SearchableItem } from "@app/lib/contentful/types";

interface AcademySidebarProps {
  searchableItems: SearchableItem[];
  tocItems?: TocItem[];
  courseImage?: BlogImage | null;
}

export function AcademySidebar({
  searchableItems,
  tocItems = [],
  courseImage,
}: AcademySidebarProps) {
  return (
    <div className="sticky top-16 flex h-[calc(100vh-4rem)] w-64 flex-col border-r border-gray-200 bg-white">
      <div className="flex-shrink-0 border-b border-gray-200 px-3 py-3">
        <Link
          href="/academy"
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Academy
        </Link>
      </div>
      <div className="flex-shrink-0 px-3 py-3">
        <AcademySearch searchableItems={searchableItems} />
      </div>

      {tocItems.length > 0 && (
        <div className="flex-shrink-0 overflow-y-auto px-3 pb-4">
          <TableOfContents
            items={tocItems}
            className="static max-h-none [&>h3]:mb-1 [&>h3]:text-xs"
          />
        </div>
      )}

      {courseImage && (
        <div className="relative mt-auto flex-shrink-0 overflow-hidden">
          <Image
            src={courseImage.url}
            alt={courseImage.alt}
            width={courseImage.width}
            height={courseImage.height}
            loader={contentfulImageLoader}
            className="w-full object-contain"
            sizes="256px"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-white via-transparent to-transparent" />
        </div>
      )}
    </div>
  );
}
