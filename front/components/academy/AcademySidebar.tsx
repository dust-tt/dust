"use client";

import { ChevronDownIcon } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import { useState } from "react";

import type { CourseSummary } from "@app/lib/contentful/types";
import { classNames } from "@app/lib/utils";

interface AcademySidebarProps {
  courses: CourseSummary[];
  currentCourseSlug?: string;
}

export function AcademySidebar({
  courses,
  currentCourseSlug,
}: AcademySidebarProps) {
  const router = useRouter();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const currentCourse = courses.find((c) => c.slug === currentCourseSlug);

  const handleCourseChange = (slug: string) => {
    router.push(`/academy/${slug}`);
    setIsDropdownOpen(false);
  };

  return (
    <div className="w-64 border-r border-gray-200 bg-white p-4">
      <div className="relative">
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-gray-50"
        >
          <span className="truncate">
            {currentCourse ? currentCourse.title : "Select a course"}
          </span>
          <ChevronDownIcon
            className={classNames(
              "ml-2 h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform",
              isDropdownOpen && "rotate-180"
            )}
          />
        </button>

        {isDropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsDropdownOpen(false)}
            />
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-96 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
              {courses.map((course) => (
                <button
                  key={course.id}
                  onClick={() => handleCourseChange(course.slug)}
                  className={classNames(
                    "w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-50",
                    course.slug === currentCourseSlug
                      ? "bg-gray-100 font-medium text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  <div className="truncate">{course.title}</div>
                  {course.courseId && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Course {course.courseId}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
