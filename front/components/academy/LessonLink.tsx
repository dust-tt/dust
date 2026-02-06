import { P } from "@app/components/home/ContentComponents";
import { LinkWrapper } from "@app/lib/platform";

interface LessonLinkProps {
  title: string;
  slug: string;
  description?: string | null;
  lessonId?: string | null;
  estimatedDurationMinutes?: number | null;
  complexity?: string | null;
  category?: string | null;
}

export function LessonLink({
  title,
  slug,
  description,
  estimatedDurationMinutes,
  complexity,
  category,
}: LessonLinkProps) {
  return (
    <LinkWrapper
      href={`/academy/lessons/${slug}`}
      className="my-6 block rounded-xl border border-highlight/20 bg-gradient-to-r from-highlight/5 to-highlight/10 p-6 transition-all hover:border-highlight/40 hover:from-highlight/10 hover:to-highlight/15"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          {category && (
            <span className="w-fit rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
              {category}
            </span>
          )}
          {description && (
            <P size="sm" className="text-muted-foreground">
              {description}
            </P>
          )}
        </div>
        {(estimatedDurationMinutes || complexity) && (
          (complexity && (
            <div className="flex flex-shrink-0 flex-wrap justify-end gap-2">
              {estimatedDurationMinutes && (
                <div className="flex items-center gap-1 rounded-full bg-white/80 px-3 py-1.5 text-xs font-medium text-gray-700 backdrop-blur-sm">
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
                  <span>{estimatedDurationMinutes} min</span>
                </div>
              )}
              {complexity && (
                <div className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-medium text-gray-700 backdrop-blur-sm">
                  {complexity}
                </div>
              )}
            </div>
          ))}
      </div>
    </LinkWrapper>
  );
}
