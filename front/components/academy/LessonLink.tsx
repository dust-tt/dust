import { Button } from "@dust-tt/sparkle";
import Link from "next/link";

import { P } from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";

interface LessonLinkProps {
  title: string;
  slug: string;
  description?: string | null;
  courseId?: string | null;
  estimatedDurationMinutes?: number | null;
}

export function LessonLink({
  title,
  slug,
  description,
  courseId,
  estimatedDurationMinutes,
}: LessonLinkProps) {
  return (
    <div className="my-6 rounded-lg border border-gray-200 bg-gray-50 p-6 transition-colors hover:border-gray-300 hover:bg-gray-100">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {courseId && <span>Lesson {courseId}</span>}
          {estimatedDurationMinutes && (
            <>
              {courseId && <span>•</span>}
              <span>{estimatedDurationMinutes} min</span>
            </>
          )}
        </div>
        <Link
          href={`/academy/lessons/${slug}`}
          className="group flex flex-col gap-2"
        >
          <h3 className="text-lg font-semibold text-foreground transition-colors group-hover:text-highlight">
            {title}
          </h3>
          {description && (
            <P size="sm" className="text-muted-foreground">
              {description}
            </P>
          )}
        </Link>
        <div className="mt-2">
          <Button
            label="View lesson"
            href={`/academy/lessons/${slug}`}
            size="sm"
            variant="outline"
          />
        </div>
      </div>
    </div>
  );
}

