import { Button } from "@dust-tt/sparkle";
import Image from "next/image";
import Link from "next/link";

import { Grid, H2, P } from "@app/components/home/ContentComponents";
import { contentfulImageLoader } from "@app/lib/contentful/imageLoader";
import type { CourseSummary } from "@app/lib/contentful/types";
import { classNames } from "@app/lib/utils";

export const ACADEMY_PAGE_SIZE = 8;

export function AcademyHeader() {
  return (
    <div className="col-span-12 flex flex-col items-start gap-3 pb-8 pt-8">
      <H2>Dust Academy</H2>
      <P>
        Check out our courses, tutorials, and videos to learn everything about
        Dust
      </P>
    </div>
  );
}

interface CourseCardProps {
  course: CourseSummary;
}

export function CourseCard({ course }: CourseCardProps) {
  return (
    <Link
      href={`/academy/${course.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow duration-200 hover:shadow-md"
    >
      <div className="relative aspect-[2/1] w-full overflow-hidden">
        <Image
          src={course.image!.url}
          alt={course.image!.alt}
          fill
          loader={contentfulImageLoader}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover"
        />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-semibold text-gray-900 group-hover:text-primary">
          {course.title}
        </h3>
        {course.description && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-snug text-gray-500">
            {course.description}
          </p>
        )}
        {course.estimatedDurationMinutes && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
            <svg
              className="h-3.5 w-3.5"
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
      </div>
    </Link>
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
        "col-span-12 pt-8",
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
      <Link
        href={`/academy/${course.slug}`}
        className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white transition-all duration-200 hover:border-gray-300 hover:shadow-lg lg:flex-row"
      >
        <div className="relative w-full overflow-hidden bg-gray-100 lg:w-1/2">
          <Image
            src={course.image!.url}
            alt={course.image!.alt}
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
      </Link>
    </div>
  );
}

interface AcademyLayoutProps {
  children: React.ReactNode;
}

export function AcademyLayout({ children }: AcademyLayoutProps) {
  return <Grid>{children}</Grid>;
}
