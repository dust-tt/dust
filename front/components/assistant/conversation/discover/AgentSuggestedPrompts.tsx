import {
  HOMEPAGE_ROW_STAGGER_SECONDS,
  HOMEPAGE_ROW_VARIANTS,
} from "@app/components/assistant/conversation/discover/HomepageUseCases";
import { HoverScrollText } from "@app/components/assistant/conversation/discover/HoverScrollText";
import {
  getIcon,
  ResourceAvatar,
} from "@app/components/resources/resources_icons";
import { MAX_AGENT_SUGGESTED_PROMPTS } from "@app/types/api/assistant/configuration/suggested_prompts";
import type { InternalAllowedIconType } from "@app/types/resources_icon_names";
import { domMax, LazyMotion, m, useReducedMotion } from "framer-motion";

const PROMPT_ICONS: InternalAllowedIconType[] = [
  "ActionDocumentTextIcon",
  "ActionChatBubbleBottomCenterTextIcon",
  "ActionLightbulbIcon",
  "ActionChatBubbleThoughtIcon",
];

interface AgentSuggestedPromptsProps {
  onPick: (prompt: string) => void;
  prompts: string[];
}

export function AgentSuggestedPrompts({
  onPick,
  prompts,
}: AgentSuggestedPromptsProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <LazyMotion features={domMax}>
      <div className="mt-4 w-full max-w-conversation">
        <m.ul
          className="flex flex-col gap-1"
          initial={shouldReduceMotion ? false : "hidden"}
          animate="visible"
          variants={{
            visible: {
              transition: { staggerChildren: HOMEPAGE_ROW_STAGGER_SECONDS },
            },
          }}
        >
          {prompts
            .slice(0, MAX_AGENT_SUGGESTED_PROMPTS)
            .map((prompt, index) => (
              <m.li
                key={prompt}
                variants={
                  shouldReduceMotion ? undefined : HOMEPAGE_ROW_VARIANTS
                }
              >
                <button
                  type="button"
                  onClick={() => onPick(prompt)}
                  className="group flex h-10 w-full items-center gap-2 rounded-xl px-2 text-left transition-colors duration-150 hover:bg-hover motion-reduce:transition-none"
                >
                  <ResourceAvatar
                    icon={getIcon(PROMPT_ICONS[index % PROMPT_ICONS.length])}
                    size="xs"
                  />
                  <HoverScrollText
                    className="copy-sm text-foreground"
                    text={prompt}
                  />
                </button>
              </m.li>
            ))}
        </m.ul>
      </div>
    </LazyMotion>
  );
}
