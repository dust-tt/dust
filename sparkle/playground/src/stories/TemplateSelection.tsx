import { Avatar, Button, Card, Page, SearchInput } from "@dust-tt/sparkle";
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
    backgroundColor: "bg-violet-100",
    tags: ["DATA"],
  },
  {
    sId: "askExternalFAQ",
    handle: "askExternalFAQ",
    userFacingDescription:
      "Talk to the FAQ of any external tool as if it was a human.",
    emoji: "🛠️",
    backgroundColor: "bg-blue-100",
    tags: ["DATA", "KNOWLEDGE"],
  },
  {
    sId: "chartBuilder",
    handle: "chartBuilder",
    userFacingDescription:
      "Build data visualizations on demand from files or conversation follow-ups.",
    emoji: "🎨",
    backgroundColor: "bg-violet-100",
    tags: ["DATA"],
  },
  {
    sId: "dataCatalogExplorer",
    handle: "dataCatalogExplorer",
    userFacingDescription:
      "Navigate your data ecosystem with instant access to schemas and relationships across tables.",
    emoji: "🔎",
    backgroundColor: "bg-violet-100",
    tags: ["DATA"],
  },
  {
    sId: "managerSidekick",
    handle: "managerSidekick",
    userFacingDescription:
      "Assist managers with daily tasks, finding information, coaching, and write-ups.",
    emoji: "👩‍💼",
    backgroundColor: "bg-orange-100",
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
    backgroundColor: "bg-violet-100",
    tags: ["DATA", "ENGINEERING"],
  },
  {
    sId: "UXWriter",
    handle: "UXWriter",
    userFacingDescription:
      "Evaluate UX writing of product copy and suggest improvements for user experience and accessibility.",
    emoji: "✏️",
    backgroundColor: "bg-green-100",
    tags: ["DESIGN"],
  },
  {
    sId: "codingBuddy",
    handle: "codingBuddy",
    userFacingDescription:
      "Assistant for code beginners. Get help writing code and getting started.",
    emoji: "🐥",
    backgroundColor: "bg-pink-100",
    tags: ["ENGINEERING"],
  },
  {
    sId: "codingExpert",
    handle: "codingExpert",
    userFacingDescription:
      "Assistant for code experts with codebase context. Straight to the point.",
    emoji: "👩‍💻",
    backgroundColor: "bg-pink-100",
    tags: ["ENGINEERING"],
  },
  {
    sId: "engHero",
    handle: "engHero",
    userFacingDescription:
      "Assist engineers during incidents by retrieving info from runbooks, GitHub, and Slack.",
    emoji: "🦹",
    backgroundColor: "bg-pink-100",
    tags: ["ENGINEERING"],
  },
  {
    sId: "incidentCommunication",
    handle: "incidentCommunication",
    userFacingDescription:
      "Write incident communications from tickets or Slack threads.",
    emoji: "🗣️",
    backgroundColor: "bg-pink-100",
    tags: ["ENGINEERING"],
  },
  {
    sId: "incidentHighlights",
    handle: "incidentHighlights",
    userFacingDescription:
      "Summarize incidents into a table with status, summary, PM, impact, and remediation.",
    emoji: "⏮️",
    backgroundColor: "bg-pink-100",
    tags: ["ENGINEERING"],
  },
  {
    sId: "techDocDigger",
    handle: "techDocDigger",
    userFacingDescription:
      "Dissect codebase history, docs, and communication to answer questions about features and code.",
    emoji: "🔍",
    backgroundColor: "bg-pink-100",
    tags: ["ENGINEERING"],
  },
  {
    sId: "ticketClassify",
    handle: "ticketClassify",
    userFacingDescription:
      "Classify or triage support or IT tickets into categories or teams.",
    emoji: "🐈‍⬛",
    backgroundColor: "bg-pink-300",
    tags: ["ENGINEERING", "OPERATIONS"],
  },
  {
    sId: "spreadsheetExpert",
    handle: "spreadsheetExpert",
    userFacingDescription:
      "Expert help on spreadsheet formulas for calculations and data manipulations.",
    emoji: "➗",
    backgroundColor: "bg-sky-200",
    tags: ["FINANCE", "OPERATIONS"],
  },
  {
    sId: "interviewNotesCleanup",
    handle: "interviewNotesCleanup",
    userFacingDescription:
      "Organize, correct, and translate hiring interview notes in seconds.",
    emoji: "🗒️",
    backgroundColor: "bg-orange-100",
    tags: ["HIRING"],
  },
  {
    sId: "interviewQuestionsWriter",
    handle: "interviewQuestionsWriter",
    userFacingDescription:
      "Generate interview questions and exercises tailored to roles with grading rubrics.",
    emoji: "🎯",
    backgroundColor: "bg-orange-100",
    tags: ["HIRING"],
  },
  {
    sId: "channelHighlights",
    handle: "channelHighlights",
    userFacingDescription:
      "Extract, summarize, and organize key highlights from communication channels.",
    emoji: "🔆",
    backgroundColor: "bg-blue-100",
    tags: ["KNOWLEDGE"],
  },
  {
    sId: "docBuilder",
    handle: "docBuilder",
    userFacingDescription: "Build documentation directly from support tickets.",
    emoji: "📝",
    backgroundColor: "bg-sky-200",
    tags: ["KNOWLEDGE", "SUPPORT"],
  },
  {
    sId: "generateQuiz",
    handle: "generateQuiz",
    userFacingDescription:
      "Generate quizzes for employee trainings on products and guidelines.",
    emoji: "💯",
    backgroundColor: "bg-blue-100",
    tags: ["KNOWLEDGE"],
  },
  {
    sId: "HRQuizzMaker",
    handle: "HRQuizzMaker",
    userFacingDescription:
      "Transform HR policy documents into interactive quizzes for employees.",
    emoji: "⁉️",
    backgroundColor: "bg-cyan-100",
    tags: ["KNOWLEDGE"],
  },
  {
    sId: "OOOCatchUp",
    handle: "OOOCatchUp",
    userFacingDescription:
      "Help users catch up quickly on their favorite topics.",
    emoji: "🌴",
    backgroundColor: "bg-blue-100",
    tags: ["KNOWLEDGE"],
  },
  {
    sId: "research",
    handle: "research",
    userFacingDescription:
      "Perform deep research in your knowledge base or on the web.",
    emoji: "🔎",
    backgroundColor: "bg-blue-100",
    tags: ["KNOWLEDGE"],
  },
  {
    sId: "slackScanner",
    handle: "slackScanner",
    userFacingDescription:
      "Get a recap of key discussions in your favorite Slack channels.",
    emoji: "👀",
    backgroundColor: "bg-blue-100",
    tags: ["KNOWLEDGE"],
  },
  {
    sId: "webSearch",
    handle: "webSearch",
    userFacingDescription:
      "Fast internet search with accurate answers and sources in under 100 words.",
    emoji: "🌐",
    backgroundColor: "bg-blue-100",
    tags: ["KNOWLEDGE"],
  },
  {
    sId: "askTeam",
    handle: "askTeam",
    userFacingDescription:
      "Knowledgeable representative for your team with accurate responses from team info.",
    emoji: "👥",
    backgroundColor: "bg-blue-100",
    tags: ["KNOWLEDGE"],
  },
  {
    sId: "askLegal",
    handle: "askLegal",
    userFacingDescription:
      "Assist with standard legal questions from internal documentation and policies.",
    emoji: "⚖️",
    backgroundColor: "bg-sky-400",
    tags: ["LEGAL"],
  },
  {
    sId: "legalReview",
    handle: "legalReview",
    userFacingDescription:
      "First pass review of MSAs, NDAs, and other legal documents.",
    emoji: "🚨",
    backgroundColor: "bg-sky-500",
    tags: ["LEGAL"],
  },
  {
    sId: "contentRefiner",
    handle: "contentRefiner",
    userFacingDescription:
      "Refine text for spelling, grammar, and style with analysis and recommendations.",
    emoji: "✨",
    backgroundColor: "bg-green-100",
    tags: ["MARKETING"],
  },
  {
    sId: "contentWriter",
    handle: "contentWriter",
    userFacingDescription:
      "SEO-optimized blog posts tailored to your company's needs and brand.",
    emoji: "✍️",
    backgroundColor: "bg-green-100",
    tags: ["MARKETING"],
  },
  {
    sId: "htmlEmail",
    handle: "htmlEmail",
    userFacingDescription:
      "Professional HTML email creator with code snippets for components and layouts.",
    emoji: "💌",
    backgroundColor: "bg-green-100",
    tags: ["MARKETING"],
  },
  {
    sId: "translate",
    handle: "translate",
    userFacingDescription:
      "Expert translations considering language, audience, and purpose. Industry-tailored.",
    emoji: "🌎",
    backgroundColor: "bg-blue-400",
    tags: ["MARKETING", "PRODUCTIVITY"],
  },
  {
    sId: "tweetWriter",
    handle: "tweetWriter",
    userFacingDescription:
      "Generate Twitter posts tailored to your company's tone.",
    emoji: "🪺",
    backgroundColor: "bg-green-100",
    tags: ["MARKETING"],
  },
  {
    sId: "customerFeedbackParser",
    handle: "customerFeedbackParser",
    userFacingDescription:
      "Categorize and analyze user feedback with sentiment analysis per category.",
    emoji: "🗣️",
    backgroundColor: "bg-pink-100",
    tags: ["OPERATIONS", "PRODUCT"],
  },
  {
    sId: "FAQBuilder",
    handle: "FAQBuilder",
    userFacingDescription:
      "Convert support tickets into a FAQ to update your documentation.",
    emoji: "🐈‍⬛",
    backgroundColor: "bg-sky-100",
    tags: ["OPERATIONS"],
  },
  {
    sId: "ITHelpDesk",
    handle: "ITHelpDesk",
    userFacingDescription: "IT Helpdesk agent to deflect common questions.",
    emoji: "🐈‍⬛",
    backgroundColor: "bg-pink-300",
    tags: ["OPERATIONS"],
  },
  {
    sId: "explainToPM",
    handle: "explainToPM",
    userFacingDescription:
      "Define and explain technical terms relevant to product managers.",
    emoji: "💡",
    backgroundColor: "bg-pink-100",
    tags: ["PRODUCT"],
  },
  {
    sId: "featureAnnouncement",
    handle: "featureAnnouncement",
    userFacingDescription:
      "Draft internal feature announcements from basic documentation.",
    emoji: "📰",
    backgroundColor: "bg-pink-100",
    tags: ["PRODUCT"],
  },
  {
    sId: "productStrategist",
    handle: "productStrategist",
    userFacingDescription:
      "Strategic insights, optimization techniques, and framework explanations for PMs.",
    emoji: "🧠",
    backgroundColor: "bg-pink-100",
    tags: ["PRODUCT"],
  },
  {
    sId: "techRadar",
    handle: "techRadar",
    userFacingDescription:
      "Track competitors' blogs and news, compare with internal product data.",
    emoji: "👂",
    backgroundColor: "bg-pink-100",
    tags: ["PRODUCT"],
  },
  {
    sId: "askExpert",
    handle: "askExpert",
    userFacingDescription:
      "Ask a Subject Matter Expert. Supports knowledge base, content, and web.",
    emoji: "💬",
    backgroundColor: "bg-blue-400",
    tags: ["PRODUCTIVITY"],
  },
  {
    sId: "explainSimply",
    handle: "explainSimply",
    userFacingDescription:
      "Explain complex topics simply using Feynman's teaching style.",
    emoji: "💡",
    backgroundColor: "bg-blue-400",
    tags: ["PRODUCTIVITY"],
  },
  {
    sId: "meetingRecap",
    handle: "meetingRecap",
    userFacingDescription:
      "Generate concise summaries from meeting transcripts.",
    emoji: "📞",
    backgroundColor: "bg-blue-400",
    tags: ["PRODUCTIVITY"],
  },
  {
    sId: "myMentor",
    handle: "myMentor",
    userFacingDescription:
      "Supportive personal coach providing tailored advice.",
    emoji: "👩‍🏫",
    backgroundColor: "bg-blue-400",
    tags: ["PRODUCTIVITY"],
  },
  {
    sId: "promptWriter",
    handle: "promptWriter",
    userFacingDescription:
      "Write and refine instructions for Dust assistants. Iterate on use cases.",
    emoji: "✍️",
    backgroundColor: "bg-blue-400",
    tags: ["PRODUCTIVITY"],
  },
  {
    sId: "socrates",
    handle: "socrates",
    userFacingDescription:
      "Challenge opinions and deepen thinking with the Socratic method.",
    emoji: "👨‍🦳",
    backgroundColor: "bg-blue-400",
    tags: ["PRODUCTIVITY"],
  },
  {
    sId: "spellChecker",
    handle: "spellChecker",
    userFacingDescription:
      "Correct spelling, punctuation, and grammar. Provide original, get corrected.",
    emoji: "🔡",
    backgroundColor: "bg-blue-400",
    tags: ["PRODUCTIVITY"],
  },
  {
    sId: "tldr",
    handle: "tldr",
    userFacingDescription:
      "Concise summaries of any text. Length, focus, and data extraction options.",
    emoji: "🤏",
    backgroundColor: "bg-blue-400",
    tags: ["PRODUCTIVITY"],
  },
  {
    sId: "writeWell",
    handle: "writeWell",
    userFacingDescription: "Transform raw written notes into polished text.",
    emoji: "✍️",
    backgroundColor: "bg-blue-400",
    tags: ["PRODUCTIVITY"],
  },
  {
    sId: "accountSnapshot",
    handle: "accountSnapshot",
    userFacingDescription: "Account briefings to prepare before meetings.",
    emoji: "🎯",
    backgroundColor: "bg-yellow-100",
    tags: ["SALES"],
  },
  {
    sId: "coldEmailer",
    handle: "coldEmailer",
    userFacingDescription:
      "Personalized cold emails using latest news about the prospect's company.",
    emoji: "📩",
    backgroundColor: "bg-yellow-100",
    tags: ["SALES"],
  },
  {
    sId: "discoveryPrep",
    handle: "discoveryPrep",
    userFacingDescription:
      "Prepare for discovery calls with prospect research and call prep notes.",
    emoji: "🔮",
    backgroundColor: "bg-yellow-100",
    tags: ["SALES"],
  },
  {
    sId: "prospectQuestions",
    handle: "prospectQuestions",
    userFacingDescription:
      "Structured responses to prospect questions on security, pricing, features, and objections.",
    emoji: "🥊",
    backgroundColor: "bg-yellow-100",
    tags: ["SALES"],
  },
  {
    sId: "salesCoach",
    handle: "salesCoach",
    userFacingDescription:
      "Analyze sales call transcripts and compare to best practices for feedback.",
    emoji: "🧑‍🏫",
    backgroundColor: "bg-yellow-100",
    tags: ["SALES"],
  },
  {
    sId: "salesMeetingRecap",
    handle: "salesMeetingRecap",
    userFacingDescription:
      "Concise meeting summaries from sales transcripts with takeaways and actions.",
    emoji: "👥",
    backgroundColor: "bg-yellow-100",
    tags: ["SALES"],
  },
  {
    sId: "supportExpert",
    handle: "supportExpert",
    userFacingDescription:
      "Find solutions from best-in-class tickets and internal procedures.",
    emoji: "🧘",
    backgroundColor: "bg-sky-200",
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
    <div className="mx-auto flex w-full max-w-4xl flex-col py-8 @container">
      <div className="flex flex-col gap-6 px-4">
        <Page.Header
          title="Start with a template"
          description="Explore different ways to use Dust. Find a setup that works for you and make it your own."
        />

        <div className="flex flex-col gap-6">
          <SearchInput
            placeholder="Search templates"
            name="search"
            value={searchTerm}
            onChange={setSearchTerm}
          />
          <div className="flex flex-row flex-wrap gap-2">
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
            <div className="flex flex-col gap-4 pb-24">
              {availableTags
                .map((tagName) => {
                  const templatesForTag = filteredTemplates.filter((t) =>
                    t.tags.includes(tagName)
                  );
                  if (!templatesForTag.length) return null;
                  const label = TAG_CONFIG[tagName]?.label ?? tagName;
                  return (
                    <div key={tagName} className="flex flex-col gap-1.5">
                      <div className="heading-base">{label}</div>
                      <div className="grid grid-cols-1 gap-2 @xs:grid-cols-2 @md:grid-cols-3">
                        {templatesForTag.map((template) => (
                          <Card
                            key={template.sId}
                            size="md"
                            variant="secondary"
                            onClick={() => {
                              onTemplateClick?.(template);
                            }}
                            className="cursor-pointer flex flex-col items-start gap-1"
                          >
                            <Avatar
                              emoji={template.emoji}
                              backgroundColor={template.backgroundColor}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <div className="heading-base line-clamp-1 text-foreground">
                                {template.handle}
                              </div>
                              <p className="line-clamp-3 text-sm text-muted-foreground">
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
