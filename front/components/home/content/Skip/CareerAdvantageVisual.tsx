import { CheckIcon, cn, Icon } from "@dust-tt/sparkle";

const TOOL_PILLS = [
  { name: "Slack", color: "bg-purple-100 text-purple-700" },
  { name: "Notion", color: "bg-gray-100 text-gray-700" },
  { name: "Drive", color: "bg-blue-100 text-blue-700" },
  { name: "Salesforce", color: "bg-sky-100 text-sky-700" },
  { name: "GitHub", color: "bg-gray-100 text-gray-700" },
];

const COMPLETED_TASKS = [
  {
    label: "PRD drafted from 12 Slack threads",
    timeAgo: "2m ago",
    accent: "bg-emerald-500",
  },
  {
    label: "Board meeting prep synthesized",
    timeAgo: "8m ago",
    accent: "bg-emerald-500",
  },
  {
    label: "Q3 competitive analysis complete",
    timeAgo: "14m ago",
    accent: "bg-emerald-500",
  },
];

export function CareerAdvantageVisual() {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
      {/* Header bar */}
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-gray-300" />
          <div className="h-2.5 w-2.5 rounded-full bg-gray-300" />
          <div className="h-2.5 w-2.5 rounded-full bg-gray-300" />
        </div>
        <div className="ml-2 h-5 flex-1 rounded bg-gray-100" />
      </div>

      <div className="p-5">
        {/* Connected tools */}
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
            Connected sources
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TOOL_PILLS.map((tool) => (
              <span
                key={tool.name}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                  tool.color
                )}
              >
                {tool.name}
              </span>
            ))}
          </div>
        </div>

        {/* Divider with flow indicator */}
        <div className="mb-4 flex items-center gap-2">
          <div className="h-px flex-1 bg-gray-100" />
          <span className="text-xs text-gray-300">&#x25BC;</span>
          <div className="h-px flex-1 bg-gray-100" />
        </div>

        {/* Completed tasks */}
        <div className="space-y-2">
          {COMPLETED_TASKS.map((task) => (
            <div
              key={task.label}
              className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2.5"
            >
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100">
                <Icon visual={CheckIcon} className="h-3 w-3 text-emerald-600" />
              </span>
              <span className="flex-1 text-sm text-gray-700">{task.label}</span>
              <span className="flex-shrink-0 text-xs text-gray-400">
                {task.timeAgo}
              </span>
            </div>
          ))}
        </div>

        {/* Bottom stat */}
        <div className="mt-4 flex justify-center">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            4.2 hours saved today
          </span>
        </div>
      </div>
    </div>
  );
}
