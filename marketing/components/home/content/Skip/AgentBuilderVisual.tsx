import { cn } from "@dust-tt/sparkle";

const AGENTS = [
  {
    name: "Support Agent",
    description: "Resolves tickets from help docs",
    emoji: "🎧",
    tools: ["Zendesk", "Notion"],
    accentColor: "bg-blue-500",
    bgColor: "bg-blue-50",
  },
  {
    name: "Ops Agent",
    description: "Updates CRM & tracks deals",
    emoji: "⚙️",
    tools: ["Salesforce", "Slack"],
    accentColor: "bg-emerald-500",
    bgColor: "bg-emerald-50",
  },
  {
    name: "Research Agent",
    description: "Synthesizes customer feedback",
    emoji: "🔍",
    tools: ["Slack", "Drive", "Notion"],
    accentColor: "bg-purple-500",
    bgColor: "bg-purple-50",
  },
];

export function AgentBuilderVisual() {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-gray-300" />
            <div className="h-2.5 w-2.5 rounded-full bg-gray-300" />
            <div className="h-2.5 w-2.5 rounded-full bg-gray-300" />
          </div>
          <span className="ml-2 text-xs font-medium text-gray-500">
            My Agents
          </span>
        </div>
        <div className="rounded-md bg-blue-500 px-2.5 py-1 text-xs font-medium text-white">
          + New Agent
        </div>
      </div>

      <div className="space-y-3 p-4">
        {AGENTS.map((agent) => (
          <div
            key={agent.name}
            className="flex items-center gap-3 rounded-xl border border-gray-100 p-3 transition-colors"
          >
            {/* Icon */}
            <div
              className={cn(
                "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-lg",
                agent.bgColor
              )}
            >
              {agent.emoji}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">
                  {agent.name}
                </span>
                <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>
              </div>
              <p className="text-xs text-gray-500">{agent.description}</p>
              {/* Tool badges */}
              <div className="mt-1 flex gap-1">
                {agent.tools.map((tool) => (
                  <span
                    key={tool}
                    className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
