import { useCallback, useEffect, useRef, useState } from "react";

import type {
  AgentMessage,
  ChatAgent,
  ChatFile,
  CommentRequest,
  Conversation,
  Conversations,
} from "../lib/coEdition";

// Mock agents for the co-edition playground: fixed answers (always the same),
// documents kept in memory. No network.

const AGENTS: ChatAgent[] = [
  {
    id: "dust",
    name: "dust",
    description: "Dust's general assistant.",
    pictureUrl: "https://dust.tt/static/systemavatar/dust_avatar_full.png",
  },
  {
    id: "writer",
    name: "writer",
    description: "Drafts and polishes documents.",
    pictureUrl: "https://dust.tt/static/droidavatar/Droid_Lime_1.jpg",
  },
  {
    id: "researcher",
    name: "researcher",
    description: "Looks things up and checks numbers.",
    pictureUrl: "https://dust.tt/static/droidavatar/Droid_Orange_4.jpg",
  },
];

// The document the agent "writes". Named and worded so the colleague
// comments seeded for it (components/doc/docSeeds.ts) anchor on its text.
const FILE_KEY = "pupchi-benchmark.md";

const DOCUMENT = `# Pupchi puppy treats: competitive benchmark

## Summary

Pupchi is a soft training treat made for puppies under 12 months. This benchmark compares four brands puppy parents already buy, to position Pupchi on price, ingredients and message before the concept test.

## Competitors

- Bocce's Bakery Soft & Chewy: oat-based with a bakery look, about $7.49 for 6 oz. Strong with retail buyers, little puppy-specific messaging.
- Zuke's Puppy Naturals: small training bites, about $6.49 for 5 oz. Owns "training" but not the first-year moments.
- Wellness Soft Puppy Bites: lamb and salmon, about $8.99 for 3 oz. Premium, vet-led positioning.
- Blue Buffalo Baby Blue: about $5.99 for 4 oz. Mass retail, broad but generic.

## Positioning

“Natural and bakery-style” is increasingly crowded and not inherently puppy-specific. Pupchi should own the first-year moments instead: the first sit, the first walk, the first night at home.

Two taglines go into the concept test:

- “Tiny treat, big moment.”
- “Made for their first year.”

## Price and pack

Most competitors sit between $6 and $9 a pouch. To land on shelf at $6.99, keep the pouch under 4 ounces to meet the stated COGS-ratio constraint, and size the bites for small mouths.

## Ingredients

Single-protein recipes, no artificial colors, and an explicit exclusion of xylitol on the front of the pack: it's the first thing owners check.

## Success metrics

- Concept test: top-2-box purchase intent above 40%.
- Trial: 5,000 pouches sold in the first 8 weeks.
- Repeat purchase within 45–60 days.
`;

const NEXT_STEPS = `## Next steps

- Run the concept test with both taglines in the first two weeks.
- Lock the pouch size with Finance once the unit-cost model is shared.
- Brief the retail team on how Pupchi differs from Bocce's.`;

// What the agent adds to a passage it's asked to rework from a comment,
// the first one the passage doesn't already have.
const PASSAGE_ADDITIONS = [
  " This matches what owners told us in the last survey.",
  " Early tests show puppies finish these treats in under a minute.",
  " We'll confirm this with 20 puppy owners before launch.",
];

const REPLIES = {
  uploaded:
    "Got it. I've read [pupchi-benchmark.md](pupchi-benchmark.md): your team already left a few comments. Edit it directly, or comment on a passage and mention me to rework it.",
  created:
    "I put together a competitive benchmark for Pupchi: four brands puppy parents already buy, compared on price, ingredients and positioning, with the taglines for the concept test and the metrics to track.\n\n[pupchi-benchmark.md](pupchi-benchmark.md)",
  noDocumentOpen:
    "The benchmark is in [pupchi-benchmark.md](pupchi-benchmark.md). Open it and tell me what to change, here or by mentioning me in a comment.",
  addedNextSteps:
    "I added a **Next steps** section at the end of the benchmark.",
  alreadyHasNextSteps:
    "The benchmark already ends with next steps. Comment on a passage and mention me, and I'll rework it.",
  reworkedPassage: "Done: I expanded this passage with what we know so far.",
  answeredQuestion:
    "The prices are shelf prices collected this month. I'd confirm them with Sales before the concept test.",
};

interface MockReply {
  content: string;
  tools: string[];
  // The document after the reply, if the reply edits it.
  markdown?: string;
}

// Markdown → plain text, to find which block a comment's quote is in.
function plain(markdown: string): string {
  return markdown
    .replace(/^\s*(#{1,6}|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function withPassageReworked(document: string, passage: string): string {
  const blocks = document.split(/\n\s*\n/);
  const quote = plain(passage);
  let index = blocks.findIndex((b) => plain(b).includes(quote));
  if (index === -1) {
    // A passage over several blocks: go by its start.
    index = blocks.findIndex((b) => plain(b).includes(quote.slice(0, 30)));
  }
  if (index === -1) {
    return document;
  }
  const block = blocks[index].trimEnd();
  const addition =
    PASSAGE_ADDITIONS.find((a) => !block.includes(a.trim())) ??
    PASSAGE_ADDITIONS[0];
  blocks[index] = block + addition;
  return blocks.join("\n\n");
}

/** The fixed reply to a conversation message. */
function replyToMessage(
  hasDocument: boolean,
  openDocument: { markdown: string } | undefined
): MockReply {
  if (openDocument) {
    if (openDocument.markdown.includes("## Next steps")) {
      return { content: REPLIES.alreadyHasNextSteps, tools: [] };
    }
    return {
      content: REPLIES.addedNextSteps,
      tools: ["documents__edit"],
      markdown: `${openDocument.markdown.trimEnd()}\n\n${NEXT_STEPS}\n`,
    };
  }
  if (!hasDocument) {
    return {
      content: REPLIES.created,
      tools: ["documents__create"],
      markdown: DOCUMENT,
    };
  }
  return { content: REPLIES.noDocumentOpen, tools: [] };
}

/** The fixed reply to a comment: questions get an answer, the rest an edit. */
function replyToComment(request: CommentRequest): MockReply {
  if (request.request.trim().endsWith("?")) {
    return { content: REPLIES.answeredQuestion, tools: [] };
  }
  return {
    content: REPLIES.reworkedPassage,
    tools: ["documents__edit"],
    markdown: withPassageReworked(request.markdown, request.passage),
  };
}

function documentFile(createdAt: Date): ChatFile {
  return {
    key: FILE_KEY,
    title: FILE_KEY,
    contentType: "text/markdown",
    createdAt,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function newConversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "New conversation",
    messages: [],
    isRunning: false,
  };
}

// The conversation the story opens on: the document is already there.
function seededConversation(): Conversation {
  const createdAt = new Date(Date.now() - 30 * 60 * 1000);
  return {
    id: "pupchi",
    title: "Pupchi competitive benchmark",
    isRunning: false,
    messages: [
      {
        id: crypto.randomUUID(),
        role: "user",
        content:
          "Here's our competitive benchmark for Pupchi. Let's review it together before the concept test.",
        createdAt,
      },
      {
        id: crypto.randomUUID(),
        role: "agent",
        agent: AGENTS[0],
        content: REPLIES.uploaded,
        tools: [],
        files: [documentFile(createdAt)],
        status: "done",
        createdAt,
      },
    ],
  };
}

export function useMockConversations(): Conversations {
  // Documents by `${conversation id}:${file key}`. A ref, so a reply's edit is
  // readable as soon as the reply finishes.
  const files = useRef(new Map<string, string>());
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const seeded = seededConversation();
    files.current.set(`${seeded.id}:${FILE_KEY}`, DOCUMENT);
    return [seeded];
  });
  const [activeId, setActiveId] = useState(() => conversations[0].id);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const updateConversation = useCallback(
    (id: string, update: (c: Conversation) => Conversation) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? update(c) : c))
      );
    },
    []
  );

  const active =
    conversations.find((c) => c.id === activeId) ?? conversations[0];

  /**
   * Shows `userText` and the agent's `reply`, paced like an agent at work:
   * thinking, tool steps, then the text streamed in.
   */
  const play = useCallback(
    async (
      conversation: Conversation,
      userText: string,
      agent: ChatAgent,
      reply: MockReply
    ) => {
      const agentMessageId = crypto.randomUUID();
      const now = new Date();
      const updateReply = (update: (m: AgentMessage) => AgentMessage) =>
        updateConversation(conversation.id, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === agentMessageId && m.role === "agent" ? update(m) : m
          ),
        }));

      updateConversation(conversation.id, (c) => ({
        ...c,
        title: c.messages.length === 0 ? userText.slice(0, 60) : c.title,
        isRunning: true,
        messages: [
          ...c.messages,
          {
            id: crypto.randomUUID(),
            role: "user",
            content: userText,
            createdAt: now,
          },
          {
            id: agentMessageId,
            role: "agent",
            agent,
            content: "",
            tools: [],
            files: [],
            status: "streaming",
            createdAt: now,
          },
        ],
      }));

      await sleep(700);
      for (const name of reply.tools) {
        if (!isMounted.current) {
          return;
        }
        updateReply((m) => ({
          ...m,
          tools: [
            ...m.tools,
            { id: crypto.randomUUID(), name, status: "running" },
          ],
        }));
        await sleep(1200);
        updateReply((m) => ({
          ...m,
          tools: m.tools.map((t) =>
            t.status === "running" ? { ...t, status: "done" } : t
          ),
        }));
      }
      if (reply.markdown !== undefined) {
        files.current.set(`${conversation.id}:${FILE_KEY}`, reply.markdown);
      }
      const words = reply.content.split(/(?<=\s)/);
      for (let i = 0; i < words.length && isMounted.current; i += 3) {
        const chunk = words.slice(i, i + 3).join("");
        updateReply((m) => ({ ...m, content: m.content + chunk }));
        await sleep(40);
      }
      updateReply((m) => ({
        ...m,
        content: reply.content,
        files: reply.markdown !== undefined ? [documentFile(new Date())] : [],
        status: "done",
      }));
      updateConversation(conversation.id, (c) => ({ ...c, isRunning: false }));
    },
    [updateConversation]
  );

  const send = useCallback(
    async (
      conversation: Conversation,
      text: string,
      agent: ChatAgent,
      openDocument?: { fileKey: string; markdown: string }
    ) => {
      const hasDocument = files.current.has(`${conversation.id}:${FILE_KEY}`);
      await play(
        conversation,
        text,
        agent,
        replyToMessage(hasDocument, openDocument)
      );
    },
    [play]
  );

  const askFromComment = useCallback(
    async (conversation: Conversation, request: CommentRequest) => {
      const agent =
        AGENTS.find((a) => a.name === request.agentName) ?? AGENTS[0];
      const reply = replyToComment(request);
      // The conversation shows the request too, as in the product.
      await play(
        conversation,
        `Comment on ${request.fileKey}: ${request.request}`,
        agent,
        reply
      );
      return {
        reply: reply.content,
        markdown: reply.markdown ?? request.markdown,
      };
    },
    [play]
  );

  const startNewConversation = useCallback(() => {
    // Reuse an untouched conversation rather than stacking empty ones.
    const empty = conversations.find((c) => c.messages.length === 0);
    if (empty) {
      setActiveId(empty.id);
      return;
    }
    const conversation = newConversation();
    setConversations((prev) => [conversation, ...prev]);
    setActiveId(conversation.id);
  }, [conversations]);

  const readFile = useCallback(
    async (conversation: Conversation, fileKey: string) => {
      const text = files.current.get(`${conversation.id}:${fileKey}`);
      if (text === undefined) {
        throw new Error("This document doesn't exist.");
      }
      return text;
    },
    []
  );

  return {
    agents: AGENTS,
    conversations,
    active,
    setActiveId,
    startNewConversation,
    send,
    askFromComment,
    readFile,
  };
}
