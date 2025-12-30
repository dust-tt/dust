import { Button } from "@dust-tt/sparkle";
import Image from "next/image";
import Link from "next/link";

import { Grid, H1, P } from "@app/components/home/ContentComponents";
import { contentfulImageLoader } from "@app/lib/contentful/imageLoader";
import type { CourseSummary } from "@app/lib/contentful/types";
import { classNames } from "@app/lib/utils";

export const ACADEMY_PAGE_SIZE = 12;

export function AcademyHeader() {
  return (
    <div className="col-span-12 flex flex-col items-center gap-0 pt-1 text-center">
      <Image
        src="/static/landing/about/Dust_Fade.png"
        alt="Dust"
        width={112}
        height={112}
        className="h-28 w-28"
        priority
      />
      <H1 className="text-5xl">Academy</H1>
      <P className="max-w-2xl text-center text-muted-foreground">
        Learn how to build and deploy AI agents with Dust through our
        comprehensive courses.
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
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white"
    >
      {course.image && (
        <Image
          src={course.image.url}
          alt={course.image.alt}
          width={640}
          height={360}
          loader={contentfulImageLoader}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="aspect-video w-full object-cover"
        />
      )}
      <div className="flex h-full flex-col gap-3 px-6 py-6">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {course.courseId && <span>Course {course.courseId}</span>}
          {course.estimatedDurationMinutes && (
            <>
              {course.courseId && <span>•</span>}
              <span>{course.estimatedDurationMinutes} min</span>
            </>
          )}
        </div>
        <h3 className="text-xl font-semibold text-foreground">
          {course.title}
        </h3>
        {course.description && (
          <p className="text-base text-muted-foreground">
            {course.description}
          </p>
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
        "col-span-12 pt-4",
        "grid gap-8 sm:grid-cols-2 lg:grid-cols-3"
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
    <div className="col-span-12 pt-4">
      <div className="grid gap-6 rounded-2xl border border-gray-100 bg-white p-6 lg:grid-cols-12">
        {course.image && (
          <Link
            href={`/academy/${course.slug}`}
            className="cursor-pointer lg:col-span-7"
          >
            <Image
              src={course.image.url}
              alt={course.image.alt}
              width={course.image.width}
              height={course.image.height}
              loader={contentfulImageLoader}
              className="aspect-[16/9] w-full rounded-xl object-cover transition-opacity hover:opacity-90"
              sizes="(max-width: 1024px) 100vw, 60vw"
            />
          </Link>
        )}
        <div className="flex h-full flex-col justify-center gap-4 lg:col-span-5">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {course.courseId && <span>Course {course.courseId}</span>}
            {course.estimatedDurationMinutes && (
              <>
                {course.courseId && <span>•</span>}
                <span>{course.estimatedDurationMinutes} min</span>
              </>
            )}
          </div>
          <Link
            href={`/academy/${course.slug}`}
            className="cursor-pointer transition-colors hover:text-highlight"
          >
            <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
              {course.title}
            </h2>
          </Link>
          {course.description && (
            <P className="text-muted-foreground">{course.description}</P>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              label="Start course"
              href={`/academy/${course.slug}`}
              size="sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface AcademyLayoutProps {
  children: React.ReactNode;
}

export function AcademyLayout({ children }: AcademyLayoutProps) {
  return <Grid>{children}</Grid>;
}
