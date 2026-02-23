import {
  Avatar,
  Button,
  Card,
  ContextItem,
  Icon,
  MagicIcon,
  Page,
  SearchInput,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

export type Template = {
  sId: string;
  handle: string;
  userFacingDescription: string;
  emoji: string;
  backgroundColor: string;
  tags: string[];
};

const TAG_CONFIG: Record<string, { label: string }> = {
  DATA: { label: "Data" },
  DESIGN: { label: "Design" },
  ENGINEERING: { label: "Engineering" },
  FINANCE: { label: "Finance" },
  HIRING: { label: "Hiring" },
  KNOWLEDGE: { label: "Knowledge" },
  LEGAL: { label: "Legal" },
  MARKETING: { label: "Marketing" },
  OPERATIONS: { label: "Operations" },
  PRODUCT: { label: "Product" },
  PRODUCT_MANAGEMENT: { label: "Product Management" },
  PRODUCTIVITY: { label: "Productivity" },
  SALES: { label: "Sales" },
  SUPPORT: { label: "Support" },
};

const FAKE_TEMPLATES: Template[] = [
  {
    sId: "analyst",
    handle: "analyst",
    userFacingDescription:
      "Self-service analytics agent for SQL queries, spreadsheets, data warehouses, and visualizations.",
    emoji: "📊",
    backgroundColor: "s-bg-violet-100",
    tags: ["DATA"],
  },
  {
    sId: "askExternalFAQ",
    handle: "askExternalFAQ",
    userFacingDescription:
      "Talk to the FAQ of any external tool as if it was a human.",
    emoji: "🛠️",
    backgroundColor: "s-bg-blue-100",
    tags: ["DATA", "KNOWLEDGE"],
  },
  {
    sId: "chartBuilder",
    handle: "chartBuilder",
    userFacingDescription:
      "Build data visualizations on demand from files or conversation follow-ups.",
    emoji: "🎨",
    backgroundColor: "s-bg-violet-100",
    tags: ["DATA"],
  },
  {
    sId: "dataCatalogExplorer",
    handle: "dataCatalogExplorer",
    userFacingDescription:
      "Navigate your data ecosystem with instant access to schemas and relationships across tables.",
    emoji: "🔎",
    backgroundColor: "s-bg-violet-100",
    tags: ["DATA"],
  },
  {
    sId: "managerCopilot",
    handle: "managerCopilot",
    userFacingDescription:
      "Assist managers with daily tasks, finding information, coaching, and write-ups.",
    emoji: "👩‍💼",
    backgroundColor: "s-bg-orange-100",
    tags: [
      "DATA",
      "ENGINEERING",
      "HIRING",
      "OPERATIONS",
      "PRODUCT_MANAGEMENT",
      "SALES",
    ],
  },
  {
    sId: "sqlExpert",
    handle: "sqlExpert",
    userFacingDescription:
      "Generate SQL queries from your schemas and informal instructions. Navigate data models.",
    emoji: "🛢️",
    backgroundColor: "s-bg-violet-100",
    tags: ["DATA", "ENGINEERING"],
  },
  {
    sId: "UXWriter",
    handle: "UXWriter",
    userFacingDescription:
      "Evaluate UX writing of product copy and suggest improvements for user experience and accessibility.",
    emoji: "✏️",
    backgroundColor: "s-bg-green-100",
    tags: ["DESIGN"],
  },
  {
    sId: "codingBuddy",
    handle: "codingBuddy",
    userFacingDescription:
      "Assistant for code beginners. Get help writing code and getting started.",
    emoji: "🐥",
    backgroundColor: "s-bg-pink-100",
    tags: ["ENGINEERING"],
  },
  {
    sId: "codingExpert",
    handle: "codingExpert",
    userFacingDescription:
      "Assistant for code experts with codebase context. Straight to the point.",
    emoji: "👩‍💻",
    backgroundColor: "s-bg-pink-100",
    tags: ["ENGINEERING"],
  },
  {
    sId: "engHero",
    handle: "engHero",
    userFacingDescription:
      "Assist engineers during incidents by retrieving info from runbooks, GitHub, and Slack.",
    emoji: "🦹",
    backgroundColor: "s-bg-pink-100",
    tags: ["ENGINEERING"],
  },
  {
    sId: "incidentCommunication",
    handle: "incidentCommunication",
    userFacingDescription:
      "Write incident communications from tickets or Slack threads.",
    emoji: "🗣️",
    backgroundColor: "s-bg-pink-100",
    tags: ["ENGINEERING"],
  },
  {
    sId: "incidentHighlights",
    handle: "incidentHighlights",
    userFacingDescription:
      "Summarize incidents into a table with status, summary, PM, impact, and remediation.",
    emoji: "⏮️",
    backgroundColor: "s-bg-pink-100",
    tags: ["ENGINEERING"],
  },
  {
    sId: "techDocDigger",
    handle: "techDocDigger",
    userFacingDescription:
      "Dissect codebase history, docs, and communication to answer questions about features and code.",
    emoji: "🔍",
    backgroundColor: "s-bg-pink-100",
    tags: ["ENGINEERING"],
  },
  {
    sId: "ticketClassify",
    handle: "ticketClassify",
    userFacingDescription:
      "Classify or triage support or IT tickets into categories or teams.",
    emoji: "🐈‍⬛",
    backgroundColor: "s-bg-pink-300",
    tags: ["ENGINEERING", "OPERATIONS"],
  },
  {
    sId: "spreadsheetExpert",
    handle: "spreadsheetExpert",
    userFacingDescription:
      "Expert help on spreadsheet formulas for calculations and data manipulations.",
    emoji: "➗",
    backgroundColor: "s-bg-sky-200",
    tags: ["FINANCE", "OPERATIONS"],
  },
  {
    sId: "interviewNotesCleanup",
    handle: "interviewNotesCleanup",
    userFacingDescription:
      "Organize, correct, and translate hiring interview notes in seconds.",
    emoji: "🗒️",
    backgroundColor: "s-bg-orange-100",
    tags: ["HIRING"],
  },
  {
    sId: "interviewQuestionsWriter",
    handle: "interviewQuestionsWriter",
    userFacingDescription:
      "Generate interview questions and exercises tailored to roles with grading rubrics.",
    emoji: "🎯",
    backgroundColor: "s-bg-orange-100",
    tags: ["HIRING"],
  },
  {
    sId: "channelHighlights",
    handle: "channelHighlights",
    userFacingDescription:
      "Extract, summarize, and organize key highlights from communication channels.",
    emoji: "🔆",
    backgroundColor: "s-bg-blue-100",
    tags: ["KNOWLEDGE"],
  },
  {
    sId: "docBuilder",
    handle: "docBuilder",
    userFacingDescription: "Build documentation directly from support tickets.",
    emoji: "📝",
    backgroundColor: "s-bg-sky-200",
    tags: ["KNOWLEDGE", "SUPPORT"],
  },
  {
    sId: "generateQuiz",
    handle: "generateQuiz",
    userFacingDescription:
      "Generate quizzes for employee trainings on products and guidelines.",
    emoji: "💯",
    backgroundColor: "s-bg-blue-100",
    tags: ["KNOWLEDGE"],
  },
  {
    sId: "HRQuizzMaker",
    handle: "HRQuizzMaker",
    userFacingDescription:
      "Transform HR policy documents into interactive quizzes for employees.",
    emoji: "⁉️",
    backgroundColor: "s-bg-cyan-100",
    tags: ["KNOWLEDGE"],
  },
  {
    sId: "OOOCatchUp",
    handle: "OOOCatchUp",
    userFacingDescription:
      "Help users catch up quickly on their favorite topics.",
    emoji: "🌴",
    backgroundColor: "s-bg-blue-100",
    tags: ["KNOWLEDGE"],
  },
  {
    sId: "research",
    handle: "research",
    userFacingDescription:
      "Perform deep research in your knowledge base or on the web.",
    emoji: "🔎",
    backgroundColor: "s-bg-blue-100",
    tags: ["KNOWLEDGE"],
  },
  {
    sId: "slackScanner",
    handle: "slackScanner",
    userFacingDescription:
      "Get a recap of key discussions in your favorite Slack channels.",
    emoji: "👀",
    backgroundColor: "s-bg-blue-100",
    tags: ["KNOWLEDGE"],
  },
  {
    sId: "webSearch",
    handle: "webSearch",
    userFacingDescription:
      "Fast internet search with accurate answers and sources in under 100 words.",
    emoji: "🌐",
    backgroundColor: "s-bg-blue-100",
    tags: ["KNOWLEDGE"],
  },
  {
    sId: "askTeam",
    handle: "askTeam",
    userFacingDescription:
      "Knowledgeable representative for your team with accurate responses from team info.",
    emoji: "👥",
    backgroundColor: "s-bg-blue-100",
    tags: ["KNOWLEDGE"],
  },
  {
    sId: "askLegal",
    handle: "askLegal",
    userFacingDescription:
      "Assist with standard legal questions from internal documentation and policies.",
    emoji: "⚖️",
    backgroundColor: "s-bg-sky-400",
    tags: ["LEGAL"],
  },
  {
    sId: "legalReview",
    handle: "legalReview",
    userFacingDescription:
      "First pass review of MSAs, NDAs, and other legal documents.",
    emoji: "🚨",
    backgroundColor: "s-bg-sky-500",
    tags: ["LEGAL"],
  },
  {
    sId: "contentRefiner",
    handle: "contentRefiner",
    userFacingDescription:
      "Refine text for spelling, grammar, and style with analysis and recommendations.",
    emoji: "✨",
    backgroundColor: "s-bg-green-100",
    tags: ["MARKETING"],
  },
  {
    sId: "contentWriter",
    handle: "contentWriter",
    userFacingDescription:
      "SEO-optimized blog posts tailored to your company's needs and brand.",
    emoji: "✍️",
    backgroundColor: "s-bg-green-100",
    tags: ["MARKETING"],
  },
  {
    sId: "htmlEmail",
    handle: "htmlEmail",
    userFacingDescription:
      "Professional HTML email creator with code snippets for components and layouts.",
    emoji: "💌",
    backgroundColor: "s-bg-green-100",
    tags: ["MARKETING"],
  },
  {
    sId: "translate",
    handle: "translate",
    userFacingDescription:
      "Expert translations considering language, audience, and purpose. Industry-tailored.",
    emoji: "🌎",
    backgroundColor: "s-bg-blue-400",
    tags: ["MARKETING", "PRODUCTIVITY"],
  },
  {
    sId: "tweetWriter",
    handle: "tweetWriter",
    userFacingDescription:
      "Generate Twitter posts tailored to your company's tone.",
    emoji: "🪺",
    backgroundColor: "s-bg-green-100",
    tags: ["MARKETING"],
  },
  {
    sId: "customerFeedbackParser",
    handle: "customerFeedbackParser",
    userFacingDescription:
      "Categorize and analyze user feedback with sentiment analysis per category.",
    emoji: "🗣️",
    backgroundColor: "s-bg-pink-100",
    tags: ["OPERATIONS", "PRODUCT"],
  },
  {
    sId: "FAQBuilder",
    handle: "FAQBuilder",
    userFacingDescription:
      "Convert support tickets into a FAQ to update your documentation.",
    emoji: "🐈‍⬛",
    backgroundColor: "s-bg-sky-100",
    tags: ["OPERATIONS"],
  },
  {
    sId: "ITHelpDesk",
    handle: "ITHelpDesk",
    userFacingDescription: "IT Helpdesk agent to deflect common questions.",
    emoji: "🐈‍⬛",
    backgroundColor: "s-bg-pink-300",
    tags: ["OPERATIONS"],
  },
  {
    sId: "explainToPM",
    handle: "explainToPM",
    userFacingDescription:
      "Define and explain technical terms relevant to product managers.",
    emoji: "💡",
    backgroundColor: "s-bg-pink-100",
    tags: ["PRODUCT"],
  },
  {
    sId: "featureAnnouncement",
    handle: "featureAnnouncement",
    userFacingDescription:
      "Draft internal feature announcements from basic documentation.",
    emoji: "📰",
    backgroundColor: "s-bg-pink-100",
    tags: ["PRODUCT"],
  },
  {
    sId: "productStrategist",
    handle: "productStrategist",
    userFacingDescription:
      "Strategic insights, optimization techniques, and framework explanations for PMs.",
    emoji: "🧠",
    backgroundColor: "s-bg-pink-100",
    tags: ["PRODUCT"],
  },
  {
    sId: "techRadar",
    handle: "techRadar",
    userFacingDescription:
      "Track competitors' blogs and news, compare with internal product data.",
    emoji: "👂",
    backgroundColor: "s-bg-pink-100",
    tags: ["PRODUCT"],
  },
  {
    sId: "askExpert",
    handle: "askExpert",
    userFacingDescription:
      "Ask a Subject Matter Expert. Supports knowledge base, content, and web.",
    emoji: "💬",
    backgroundColor: "s-bg-blue-400",
    tags: ["PRODUCTIVITY"],
  },
  {
    sId: "explainSimply",
    handle: "explainSimply",
    userFacingDescription:
      "Explain complex topics simply using Feynman's teaching style.",
    emoji: "💡",
    backgroundColor: "s-bg-blue-400",
    tags: ["PRODUCTIVITY"],
  },
  {
    sId: "meetingRecap",
    handle: "meetingRecap",
    userFacingDescription:
      "Generate concise summaries from meeting transcripts.",
    emoji: "📞",
    backgroundColor: "s-bg-blue-400",
    tags: ["PRODUCTIVITY"],
  },
  {
    sId: "myMentor",
    handle: "myMentor",
    userFacingDescription:
      "Supportive personal coach providing tailored advice.",
    emoji: "👩‍🏫",
    backgroundColor: "s-bg-blue-400",
    tags: ["PRODUCTIVITY"],
  },
  {
    sId: "promptWriter",
    handle: "promptWriter",
    userFacingDescription:
      "Write and refine instructions for Dust assistants. Iterate on use cases.",
    emoji: "✍️",
    backgroundColor: "s-bg-blue-400",
    tags: ["PRODUCTIVITY"],
  },
  {
    sId: "socrates",
    handle: "socrates",
    userFacingDescription:
      "Challenge opinions and deepen thinking with the Socratic method.",
    emoji: "👨‍🦳",
    backgroundColor: "s-bg-blue-400",
    tags: ["PRODUCTIVITY"],
  },
  {
    sId: "spellChecker",
    handle: "spellChecker",
    userFacingDescription:
      "Correct spelling, punctuation, and grammar. Provide original, get corrected.",
    emoji: "🔡",
    backgroundColor: "s-bg-blue-400",
    tags: ["PRODUCTIVITY"],
  },
  {
    sId: "tldr",
    handle: "tldr",
    userFacingDescription:
      "Concise summaries of any text. Length, focus, and data extraction options.",
    emoji: "🤏",
    backgroundColor: "s-bg-blue-400",
    tags: ["PRODUCTIVITY"],
  },
  {
    sId: "writeWell",
    handle: "writeWell",
    userFacingDescription: "Transform raw written notes into polished text.",
    emoji: "✍️",
    backgroundColor: "s-bg-blue-400",
    tags: ["PRODUCTIVITY"],
  },
  {
    sId: "accountSnapshot",
    handle: "accountSnapshot",
    userFacingDescription: "Account briefings to prepare before meetings.",
    emoji: "🎯",
    backgroundColor: "s-bg-yellow-100",
    tags: ["SALES"],
  },
  {
    sId: "coldEmailer",
    handle: "coldEmailer",
    userFacingDescription:
      "Personalized cold emails using latest news about the prospect's company.",
    emoji: "📩",
    backgroundColor: "s-bg-yellow-100",
    tags: ["SALES"],
  },
  {
    sId: "discoveryPrep",
    handle: "discoveryPrep",
    userFacingDescription:
      "Prepare for discovery calls with prospect research and call prep notes.",
    emoji: "🔮",
    backgroundColor: "s-bg-yellow-100",
    tags: ["SALES"],
  },
  {
    sId: "prospectQuestions",
    handle: "prospectQuestions",
    userFacingDescription:
      "Structured responses to prospect questions on security, pricing, features, and objections.",
    emoji: "🥊",
    backgroundColor: "s-bg-yellow-100",
    tags: ["SALES"],
  },
  {
    sId: "salesCoach",
    handle: "salesCoach",
    userFacingDescription:
      "Analyze sales call transcripts and compare to best practices for feedback.",
    emoji: "🧑‍🏫",
    backgroundColor: "s-bg-yellow-100",
    tags: ["SALES"],
  },
  {
    sId: "salesMeetingRecap",
    handle: "salesMeetingRecap",
    userFacingDescription:
      "Concise meeting summaries from sales transcripts with takeaways and actions.",
    emoji: "👥",
    backgroundColor: "s-bg-yellow-100",
    tags: ["SALES"],
  },
  {
    sId: "supportExpert",
    handle: "supportExpert",
    userFacingDescription:
      "Find solutions from best-in-class tickets and internal procedures.",
    emoji: "🧘",
    backgroundColor: "s-bg-sky-200",
    tags: ["SUPPORT"],
  },
];

function getUniqueTemplateTags(templates: Template[]): string[] {
  return Array.from(new Set(templates.flatMap((t) => t.tags))).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
}

export default function TemplateSelection({
  onTemplateClick,
}: {
  onTemplateClick?: (template: Template) => void;
} = {}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const { filteredTemplates, availableTags } = useMemo(() => {
    const filtered = FAKE_TEMPLATES.filter((template) => {
      if (
        selectedTags.length > 0 &&
        !selectedTags.some((tag) => template.tags.includes(tag))
      ) {
        return false;
      }
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        return (
          template.handle.toLowerCase().includes(searchLower) ||
          template.userFacingDescription.toLowerCase().includes(searchLower)
        );
      }
      return true;
    });
    const tags =
      selectedTags.length > 0 ? selectedTags : getUniqueTemplateTags(filtered);
    return { filteredTemplates: filtered, availableTags: tags };
  }, [selectedTags, searchTerm]);

  const handleTagClick = (tagName: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagName)
        ? prev.filter((t) => t !== tagName)
        : [...prev, tagName]
    );
  };

  return (
    <div className="s-mx-auto s-flex s-w-full s-max-w-4xl s-flex-col s-py-8 s-@container">
      <div className="s-flex s-flex-col s-gap-6 s-px-4">
        <Page.Header
          title="Start with a template"
          description="Explore different ways to use Dust. Find a setup that works for you and make it your own."
        />

        <div className="s-flex s-flex-col s-gap-6">
          <SearchInput
            placeholder="Search templates"
            name="search"
            value={searchTerm}
            onChange={setSearchTerm}
          />
          <div className="s-flex s-flex-row s-flex-wrap s-gap-2">
            {Object.entries(TAG_CONFIG).map(([tagCode, config]) => (
              <Button
                key={tagCode}
                label={config.label}
                variant={selectedTags.includes(tagCode) ? "primary" : "outline"}
                size="xs"
                onClick={() => handleTagClick(tagCode)}
              />
            ))}
          </div>
        </div>

        {filteredTemplates.length > 0 && (
          <>
            <div className="s-flex s-flex-col s-gap-4 s-pb-24">
              {availableTags
                .map((tagName) => {
                  const templatesForTag = filteredTemplates.filter((t) =>
                    t.tags.includes(tagName)
                  );
                  if (!templatesForTag.length) return null;
                  const label = TAG_CONFIG[tagName]?.label ?? tagName;
                  return (
                    <div key={tagName} className="s-flex s-flex-col s-gap-1.5">
                      <div className="s-heading-base">{label}</div>
                      <div className="s-grid s-grid-cols-1 s-gap-2 @xs:s-grid-cols-2 @md:s-grid-cols-3">
                        {templatesForTag.map((template) => (
                          <Card
                            key={template.sId}
                            size="md"
                            variant="secondary"
                            onClick={() => {
                              onTemplateClick?.(template);
                            }}
                            className="s-cursor-pointer s-flex s-flex-row s-items-start s-gap-3"
                          >
                            <Avatar
                              emoji={template.emoji}
                              backgroundColor={template.backgroundColor}
                              size="sm"
                            />
                            <div className="s-min-w-0 s-flex-1 s-space-y-1">
                              <div className="s-heading-base s-line-clamp-1 s-text-foreground dark:s-text-foreground-night">
                                {template.handle}
                              </div>
                              <p className="s-line-clamp-2 s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
                                {template.userFacingDescription}
                              </p>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  );
                })
                .filter(Boolean)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
