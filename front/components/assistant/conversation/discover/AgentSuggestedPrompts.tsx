import {
  HOMEPAGE_ROW_STAGGER_SECONDS,
  HOMEPAGE_ROW_VARIANTS,
} from "@app/components/assistant/conversation/discover/HomepageUseCases";
import { HoverScrollText } from "@app/components/assistant/conversation/discover/HoverScrollText";
import { MAX_AGENT_SUGGESTED_PROMPTS } from "@app/types/api/assistant/configuration/suggested_prompts";
import type { RichAgentMention } from "@app/types/assistant/mentions";
import { Avatar } from "@dust-tt/sparkle";
import { domMax, LazyMotion, m, useReducedMotion } from "framer-motion";

interface AgentSuggestedPromptsProps {
  agent: RichAgentMention;
  onPick: (prompt: string) => void;
  prompts: string[];
}

export function AgentSuggestedPrompts({
  agent,
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
          {prompts.slice(0, MAX_AGENT_SUGGESTED_PROMPTS).map((prompt) => (
            <m.li
              key={prompt}
              variants={shouldReduceMotion ? undefined : HOMEPAGE_ROW_VARIANTS}
            >
              <button
                type="button"
                onClick={() => onPick(prompt)}
                className="group flex h-10 w-full items-center gap-2 rounded-xl px-2 text-left transition-colors duration-150 hover:bg-hover motion-reduce:transition-none"
              >
                <Avatar visual={agent.pictureUrl} size="xs" />
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
