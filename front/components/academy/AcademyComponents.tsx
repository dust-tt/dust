"use client";

import { Grid, H2, P } from "@app/components/home/ContentComponents";
import { contentfulImageLoader } from "@app/lib/contentful/imageLoader";
import type { CourseSummary, SearchableItem } from "@app/lib/contentful/types";
import { LinkWrapper, useAppRouter } from "@app/lib/platform";
import { classNames } from "@app/lib/utils";
import { Button, SearchInput } from "@dust-tt/sparkle";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const ACADEMY_PAGE_SIZE = 8;

interface AcademySearchProps {
  searchableItems: SearchableItem[];
  className?: string;
}

function getItemUrl(item: SearchableItem): string {
  let basePath: string;
  if (item.contentType === "lesson") {
    basePath = `/academy/lessons/${item.slug}`;
  } else if (item.contentType === "chapter" && item.courseSlug) {
    basePath = `/academy/${item.courseSlug}/chapter/${item.slug}`;
  } else {
    basePath = `/academy/${item.slug}`;
  }

  if (item.type === "section" && item.sectionId) {
    return `${basePath}#${item.sectionId}`;
  }
  return basePath;
}

interface SnippetPart {
  text: string;
  isHighlight: boolean;
}

function extractSnippet(
  searchText: string,
  query: string
): SnippetPart[] | null {
  const lowerQuery = query.toLowerCase();
  const index = searchText.indexOf(lowerQuery);
  if (index === -1) {
    return null;
  }

  const start = Math.max(0, index - 30);
  const end = Math.min(searchText.length, index + lowerQuery.length + 50);

  const prefix = start > 0 ? "..." : "";
  const suffix = end < searchText.length ? "..." : "";

  const beforeMatch = prefix + searchText.slice(start, index);
  const match = searchText.slice(index, index + lowerQuery.length);
  const afterMatch = searchText.slice(index + lowerQuery.length, end) + suffix;

  const parts: SnippetPart[] = [];
  if (beforeMatch) {
    parts.push({ text: beforeMatch, isHighlight: false });
  }
  parts.push({ text: match, isHighlight: true });
  if (afterMatch) {
    parts.push({ text: afterMatch, isHighlight: false });
  }

  return parts;
}

export function AcademySearch({
  searchableItems,
  className,
}: AcademySearchProps) {
  const router = useAppRouter();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    width: 240,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Filter items based on debounced query
  const filteredItems = useMemo(() => {
    if (!debouncedQuery.trim()) {
      return [];
    }
    const q = debouncedQuery.toLowerCase();
    return searchableItems
      .filter((item) => item.searchText.includes(q))
      .slice(0, 10);
  }, [searchableItems, debouncedQuery]);

  // Open dropdown when there are results
  useEffect(() => {
    if (filteredItems.length > 0 && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: containerRef.current.offsetWidth,
      });
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
    setSelectedIndex(0);
  }, [filteredItems]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) {
        return;
      }
      const isInsideContainer = containerRef.current?.contains(target);
      const isInsideDropdown = dropdownRef.current?.contains(target);

      if (!isInsideContainer && !isInsideDropdown) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    (item: SearchableItem) => {
      setQuery("");
      setIsOpen(false);
      void router.push(getItemUrl(item));
    },
    [router]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || filteredItems.length === 0) {
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleSelect(filteredItems[selectedIndex]);
      } else if (e.key === "Escape") {
        setIsOpen(false);
      }
    },
    [isOpen, filteredItems, selectedIndex, handleSelect]
  );

  return (
    <>
      <div
        ref={containerRef}
        className={classNames("relative", className ?? "")}
      >
        <SearchInput
          name="academy-search"
          placeholder="Search..."
          value={query}
          onChange={(value) => setQuery(value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (filteredItems.length > 0 && containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              setDropdownPosition({
                top: rect.bottom + 4,
                left: rect.left,
                width: containerRef.current.offsetWidth,
              });
              setIsOpen(true);
            }
          }}
        />
      </div>
      {isOpen && filteredItems.length > 0 && (
        <div
          ref={dropdownRef}
          className="fixed z-[100] max-h-96 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: Math.max(dropdownPosition.width, 360),
          }}
        >
          {filteredItems.map((item, index) => {
            const snippetParts = extractSnippet(
              item.searchText,
              debouncedQuery
            );

            return (
              <button
                key={`${item.contentType}-${item.slug}-${item.sectionId ?? "main"}`}
                type="button"
                className={classNames(
                  "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors",
                  index === selectedIndex ? "bg-gray-100" : "hover:bg-gray-50"
                )}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-900">
                    {item.type === "section" ? item.sectionTitle : item.title}
                  </div>
                  {item.type === "section" && (
                    <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                      <span className="text-gray-400">↳</span>
                      <span className="truncate rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-700">
                        {item.title}
                      </span>
                    </div>
                  )}
                  {snippetParts && (
                    <div className="mt-1 line-clamp-2 text-xs text-gray-400">
                      {snippetParts.map((part, i) =>
                        part.isHighlight ? (
                          <mark key={i} className="bg-yellow-200 text-gray-700">
                            {part.text}
                          </mark>
                        ) : (
                          <span key={i}>{part.text}</span>
                        )
                      )}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

export function AcademyHeader() {
  return (
    <>
      <H2>Dust Academy</H2>
      <P>
        Check out our courses, tutorials, and videos to learn everything about
        Dust
      </P>
    </>
  );
}

interface CourseCardProps {
  course: CourseSummary;
}

export function CourseCard({ course }: CourseCardProps) {
  return (
    <LinkWrapper
      href={`/academy/${course.slug}`}
      className="group relative aspect-[5/2] overflow-hidden rounded-xl border border-gray-200 transition-colors duration-200 hover:border-gray-400"
    >
      <Image
        src={course.image?.url ?? ""}
        alt={course.image?.alt ?? course.title}
        fill
        loader={contentfulImageLoader}
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        className="object-cover transition-transform duration-300 group-hover:scale-105"
      />

      {course.estimatedDurationMinutes && (
        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm backdrop-blur-sm">
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          <span>{course.estimatedDurationMinutes} min</span>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 p-4">
        <h3 className="text-xl font-semibold text-gray-900 md:text-2xl">
          {course.title}
        </h3>
        {course.description && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-snug text-gray-600">
            {course.description}
          </p>
        )}
      </div>
    </LinkWrapper>
  );
}

interface CourseGridProps {
  courses: CourseSummary[];
  emptyMessage?: string;
}

export function CourseGrid({ courses, emptyMessage }: CourseGridProps) {
  return (
    <div
      className={classNames(
        "col-span-12",
        "grid gap-6 sm:grid-cols-1 lg:grid-cols-2"
      )}
    >
      {courses.length > 0 ? (
        courses.map((course) => <CourseCard key={course.id} course={course} />)
      ) : (
        <div className="col-span-full py-12 text-center">
          <P size="md" className="text-muted-foreground">
            {emptyMessage ?? "No courses available."}
          </P>
        </div>
      )}
    </div>
  );
}

interface FeaturedCourseProps {
  course: CourseSummary;
}

export function FeaturedCourse({ course }: FeaturedCourseProps) {
  return (
    <div className="col-span-12 pt-8">
      <LinkWrapper
        href={`/academy/${course.slug}`}
        className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white transition-all duration-200 hover:border-gray-300 hover:shadow-lg lg:flex-row"
      >
        <div className="relative w-full overflow-hidden bg-gray-100 lg:w-1/2">
          <Image
            src={course.image?.url ?? ""}
            alt={course.image?.alt ?? course.title}
            width={800}
            height={600}
            loader={contentfulImageLoader}
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="h-full w-full object-cover transition-opacity duration-200 group-hover:opacity-90"
          />
        </div>

        <div className="flex w-full flex-col justify-center gap-6 p-10 lg:w-1/2">
          <div className="inline-block">
            <span className="rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
              Featured Course
            </span>
          </div>
          <h2 className="text-3xl font-semibold text-gray-900 transition-colors group-hover:text-primary md:text-4xl">
            {course.title}
          </h2>
          {course.description && (
            <p className="text-lg leading-relaxed text-gray-600">
              {course.description}
            </p>
          )}
          <div>
            <Button
              label="Start learning"
              href={`/academy/${course.slug}`}
              size="md"
              variant="primary"
            />
          </div>
        </div>
      </LinkWrapper>
    </div>
  );
}

interface AcademyLayoutProps {
  children: React.ReactNode;
}

export function AcademyLayout({ children }: AcademyLayoutProps) {
  return <Grid>{children}</Grid>;
}
