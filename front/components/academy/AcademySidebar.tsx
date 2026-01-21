"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";

import { TableOfContents } from "@app/components/blog/TableOfContents";
import type { TocItem } from "@app/lib/contentful/tableOfContents";
import type { CourseSummary } from "@app/lib/contentful/types";

interface AcademySidebarProps {
  courses: CourseSummary[];
  currentCourseSlug?: string;
  tocItems?: TocItem[];
}

export function AcademySidebar({
  courses,
  currentCourseSlug,
  tocItems = [],
}: AcademySidebarProps) {
  const router = useRouter();

  const currentCourse = courses.find((c) => c.slug === currentCourseSlug);

  const handleCourseChange = (slug: string) => {
    void router.push(`/academy/${slug}`);
  };

  return (
    <div className="sticky top-16 h-[calc(100vh-4rem)] w-64 border-r border-gray-200 bg-white">
      <div className="flex h-full flex-col">
        <div className="flex-shrink-0 px-3 py-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between"
                label={currentCourse?.title ?? "Select a course"}
                isSelect
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
              <DropdownMenuRadioGroup
                value={currentCourseSlug ?? ""}
                onValueChange={handleCourseChange}
              >
                {courses.map((course) => (
                  <DropdownMenuRadioItem
                    key={course.id}
                    value={course.slug}
                    label={course.title}
                  />
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {tocItems.length > 0 && (
          <div className="flex-1 overflow-y-auto px-3 pb-4">
            <TableOfContents
              items={tocItems}
              className="static max-h-none [&>h3]:mb-1 [&>h3]:text-xs"
            />
          </div>
        )}
      </div>
    </div>
  );
}
