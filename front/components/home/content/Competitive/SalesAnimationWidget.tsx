import { Icon, TimeIcon } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

const TASKS = [
  {
    id: "gong",
    dotColor: "bg-blue-500",
    text: "Analyzing Gong call transcript...",
  },
  {
    id: "follow-up",
    dotColor: "bg-orange-400",
    text: "Drafting personalized follow-up...",
  },
  {
    id: "questionnaire",
    dotColor: "bg-gray-400",
    text: "Completing security questionnaire...",
  },
  {
    id: "hubspot",
    dotColor: "bg-green-500",
    text: "Updating HubSpot deal record...",
  },
] as const;

const TASK_STAGGER_MS = 900;
const COMPLETION_DELAY_MS = TASKS.length * TASK_STAGGER_MS + 500;
const LOOP_DURATION_MS = COMPLETION_DELAY_MS + 2500;

export function SalesAnimationWidget() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [showCompletion, setShowCompletion] = useState(false);

  useEffect(() => {
    const ids: ReturnType<typeof setTimeout>[] = [];

    const animate = () => {
      setVisibleCount(0);
      setShowCompletion(false);

      TASKS.forEach((_, i) => {
        ids.push(
          setTimeout(() => setVisibleCount(i + 1), 600 + i * TASK_STAGGER_MS)
        );
      });

      ids.push(setTimeout(() => setShowCompletion(true), COMPLETION_DELAY_MS));
      ids.push(setTimeout(animate, LOOP_DURATION_MS));
    };

    animate();

    return () => ids.forEach(clearTimeout);
  }, []);

  return (
    <div className="mx-auto mt-10 w-full max-w-sm">
      <div className="overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
        {/* CRM context card */}
        <div className="border-b border-gray-100 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                New Opportunity
              </span>
              <span className="text-sm text-gray-500">Enterprise Corp</span>
            </div>
            <span className="text-sm font-bold text-emerald-600">
              $500K ARR
            </span>
          </div>
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">
              SC
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight text-gray-900">
                Sarah Chen
              </p>
              <p className="text-xs text-gray-400">Account Executive</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
            <svg
              className="h-3.5 w-3.5 flex-shrink-0 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z"
              />
            </svg>
            <span className="text-sm text-gray-500">
              Sales call just ended...
            </span>
          </div>
        </div>

        {/* Animated task list */}
        <div className="space-y-2.5 p-4">
          {TASKS.map((task, i) => (
            <div
              key={task.id}
              className={`flex items-center gap-3 transition-all duration-500 ease-out ${
                visibleCount > i
                  ? "translate-y-0 opacity-100"
                  : "translate-y-2 opacity-0"
              }`}
            >
              <span
                className={`h-2 w-2 flex-shrink-0 rounded-full ${task.dotColor}`}
              />
              <span className="text-sm text-gray-600">{task.text}</span>
            </div>
          ))}
        </div>

        {/* Completion banner */}
        <div
          className={`mx-4 mb-4 flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 transition-all duration-500 ease-out ${
            showCompletion
              ? "translate-y-0 opacity-100"
              : "translate-y-2 opacity-0"
          }`}
        >
          <Icon visual={TimeIcon} className="h-4 w-4 text-emerald-600" />
          <span className="text-sm font-semibold text-emerald-700">
            4 post-call tasks done in 45 seconds
          </span>
        </div>
      </div>
    </div>
  );
}
