import { Button } from "@dust-tt/sparkle";
import Link from "next/link";

import { P } from "@app/components/home/ContentComponents";

interface LessonLinkProps {
  title: string;
  slug: string;
  description?: string | null;
  lessonId?: string | null;
  estimatedDurationMinutes?: number | null;
  complexity?: string | null;
}

export function LessonLink({
  title,
  slug,
  description,
  lessonId,
  estimatedDurationMinutes,
  complexity,
}: LessonLinkProps) {
  return (
    <div className="my-6 rounded-lg border border-gray-200 bg-gray-50 p-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {lessonId && <span>Lesson {lessonId}</span>}
          {estimatedDurationMinutes && (
            <>
              {lessonId && <span>•</span>}
              <span>{estimatedDurationMinutes} min</span>
            </>
          )}
          {complexity && (
            <>
              {(lessonId || estimatedDurationMinutes) && <span>•</span>}
              <span>{complexity}</span>
            </>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold text-foreground">
            {title}
          </h3>
          {description && (
            <P size="sm" className="text-muted-foreground">
              {description}
            </P>
          )}
        </div>
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
