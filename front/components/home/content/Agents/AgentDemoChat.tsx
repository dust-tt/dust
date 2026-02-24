import {
  ArrowUpIcon,
  Button,
  Icon,
  RocketIcon,
  Spinner,
} from "@dust-tt/sparkle";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

import type { AgentConfig } from "@app/components/home/content/Agents/agentsConfig";
import { classNames } from "@app/lib/utils";

interface AgentDemoChatProps {
  agent: AgentConfig;
}

interface Message {
  type: "user" | "agent";
  text: string;
  isGeneric?: boolean;
}

export function AgentDemoChat({ agent }: AgentDemoChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const AgentIcon = agent.icon;

  const GENERIC_RESPONSE = `This is a demo preview. Sign up for free to use **${agent.title}** with your own data and get real AI-powered responses.`;

  function handleSend(text?: string) {
    const question = text ?? inputText;
    if (!question.trim() || isTyping) {
      return;
    }

    const exchange = agent.demoExchanges.find((e) => e.question === question);

    setInputText("");
    setIsTyping(true);
    setMessages([{ type: "user", text: question }]);

    setTimeout(() => {
      setIsTyping(false);
      const answer = exchange ? exchange.answer : GENERIC_RESPONSE;
      setMessages([
        { type: "user", text: question },
        { type: "agent", text: answer, isGeneric: !exchange },
      ]);
    }, 1500);
  }

  function handleChipClick(question: string) {
    handleSend(question);
  }

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, isTyping]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [inputText]);

  const showConversation = messages.length > 0 || isTyping;
  const lastMessage = messages[messages.length - 1];
  const showCTA = lastMessage?.type === "agent";

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
      {/* Header */}
      <div
        className={classNames(
          "flex items-center gap-3 px-4 py-3",
          agent.colorClasses.bg
        )}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/60">
          <Icon
            visual={AgentIcon}
            className={agent.colorClasses.icon}
            size="xs"
          />
        </div>
        <span className="text-sm font-semibold text-foreground">
          {agent.title}
        </span>
        <span className="ml-auto rounded-full bg-white/40 px-2 py-0.5 text-xs font-medium text-foreground/60">
          Demo
        </span>
      </div>

      {/* Conversation zone — fixed height */}
      <div className="relative h-64 overflow-y-auto p-4 scrollbar-hide">
        {!showConversation ? (
          /* Empty state */
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Icon
              visual={AgentIcon}
              className={classNames("opacity-20", agent.colorClasses.icon)}
              size="md"
            />
            <p className="text-sm text-muted-foreground">
              Choose an example below or type your question
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* User bubble */}
            {messages.length > 0 && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary-100 px-4 py-3 text-sm text-primary-900">
                  {messages[0].text}
                </div>
              </div>
            )}

            {/* Agent bubble — spinner */}
            {isTyping && (
              <div className="flex items-start gap-3">
                <div
                  className={classNames(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                    agent.colorClasses.bg
                  )}
                >
                  <Icon
                    visual={AgentIcon}
                    className={agent.colorClasses.icon}
                    size="xs"
                  />
                </div>
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-border bg-background px-4 py-3">
                  <Spinner size="xs" variant="dark" />
                  <span className="text-sm text-muted-foreground">
                    Thinking...
                  </span>
                </div>
              </div>
            )}

            {/* Agent bubble — answer */}
            {messages.length > 1 && (
              <div className="flex items-start gap-3">
                <div
                  className={classNames(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                    agent.colorClasses.bg
                  )}
                >
                  <Icon
                    visual={AgentIcon}
                    className={agent.colorClasses.icon}
                    size="xs"
                  />
                </div>
                <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-border bg-background px-4 py-3">
                  <div className="prose prose-sm max-w-none text-foreground [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:text-sm [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-sm [&_th]:font-semibold">
                    <ReactMarkdown>{messages[1].text}</ReactMarkdown>
                  </div>
                </div>
              </div>
            )}

            {/* CTA */}
            {showCTA && (
              <div className="flex justify-center">
                <Link
                  href="/home/pricing"
                  className="flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <Icon visual={RocketIcon} size="xs" className="text-white" />
                  Try with your own data → Sign up free
                </Link>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Chips */}
      <div className="border-t border-border px-4 py-2.5">
        <div className="flex flex-wrap gap-1.5">
          {agent.demoExchanges.map((exchange, index) => (
            <button
              key={index}
              onClick={() => handleChipClick(exchange.question)}
              disabled={isTyping}
              className={classNames(
                "rounded-full border px-3 py-1.5 text-left text-xs font-medium transition-all",
                "hover:border-primary-300 hover:bg-primary-50",
                "border-border bg-background text-foreground",
                isTyping ? "cursor-not-allowed opacity-50" : ""
              )}
            >
              {exchange.question}
            </button>
          ))}
        </div>
      </div>

      {/* Input bar */}
      <div className="border-t border-border px-3 pb-3 pt-2">
        <div
          className={classNames(
            "rounded-xl transition-all duration-300",
            "bg-muted-background",
            "border border-border-dark",
            "focus-within:border-highlight-300"
          )}
        >
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={`Message ${agent.title}...`}
            className={classNames(
              "inline-block w-full resize-none bg-transparent",
              "border-0 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0",
              "whitespace-pre-wrap text-sm font-normal",
              "px-3 pt-2.5 sm:pl-3.5",
              "scrollbar-hide overflow-y-auto",
              "max-h-[20vh] min-h-10"
            )}
          />
          <div className="flex items-center justify-end px-2 pb-1.5">
            <Button
              size="xs"
              icon={ArrowUpIcon}
              variant="highlight"
              disabled={!inputText.trim() || isTyping}
              onClick={() => handleSend()}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
