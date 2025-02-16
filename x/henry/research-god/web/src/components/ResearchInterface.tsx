import { useState, useEffect, useRef } from "react";
import {
  Container,
  Title,
  Textarea,
  NumberInput,
  Button,
  Paper,
  Text,
  Stack,
  Group,
  Switch,
  Divider,
  ScrollArea,
  Card,
  Center,
  AppShell,
  Badge,
  Box,
  Loader,
  Tabs,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  IconSearch,
  IconX,
  IconEye,
  IconArrowRight,
  IconCheck,
  IconCircleDot,
} from "@tabler/icons-react";
import type {
  ExplorationResult,
  ProgressEvent,
  TokenUsage,
} from "../../../src/types/research";
import type { ResearchRequest } from "../api/research";
import { useHotkeys } from "@mantine/hooks";
import ReactMarkdown from "react-markdown";

interface TopicNode {
  id: string;
  title: string;
  timestamp: string;
  urls: string[];
  subtopics: TopicNode[];
  depth: number;
  tokenCount?: number;
  status?: "exploring" | "completed" | "pending";
}

interface ReportSection {
  title: string;
  content: string;
  citations?: Array<{
    url: string;
    title: string;
    snippet: string;
  }>;
}

const containerStyle = {
  backgroundColor: "#1A1B1E",
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column" as const,
  overflow: "hidden",
  backgroundImage:
    "radial-gradient(circle at 50% 50%, #25262B 0%, #1A1B1E 100%)",
};

const resultCardHoverStyle = {
  transition: "all 0.2s ease",
  border: "1px solid #2C2E33",
  "&:hover": {
    backgroundColor: "#25262B",
    transform: "translateY(-2px)",
    boxShadow: "0 5px 15px rgba(0, 0, 0, 0.3)",
  },
};

// Add these style objects near the top with other styles
const textAreaStyles = {
  input: {
    backgroundColor: "rgba(37, 38, 43, 0.5)",
    border: "1px solid #373A40",
    transition: "all 0.2s ease",
    "&:focus": {
      backgroundColor: "rgba(37, 38, 43, 0.8)",
      borderColor: "#7B22FD",
    },
    "&:hover": {
      backgroundColor: "rgba(37, 38, 43, 0.7)",
    },
  },
  label: {
    marginBottom: "0.5rem",
    fontSize: "1rem",
    fontWeight: 500,
  },
  description: {
    marginBottom: "0.5rem",
  },
};

const numberInputStyles = {
  input: {
    backgroundColor: "rgba(37, 38, 43, 0.5)",
    border: "1px solid #373A40",
    transition: "all 0.2s ease",
    "&:focus": {
      backgroundColor: "rgba(37, 38, 43, 0.8)",
      borderColor: "#7B22FD",
    },
    "&:hover": {
      backgroundColor: "rgba(37, 38, 43, 0.7)",
    },
  },
  label: {
    marginBottom: "0.5rem",
    fontSize: "1rem",
    fontWeight: 500,
  },
  description: {
    marginBottom: "0.5rem",
  },
};

// Add this near the top with other style constants
const noHighlightButton = {
  WebkitTapHighlightColor: "transparent",
  outline: "none",
  border: "none",
  cursor: "pointer",
};

// Add this new component before ScratchpadView
function ResultCard({ result }: { result: ExplorationResult }) {
  // Create a Set of unique URLs to prevent duplicates
  const uniqueContent = result.relevantContent.reduce((acc, content) => {
    const existingContent = acc.find((c) => c.url === content.url);
    if (!existingContent) {
      acc.push(content);
    } else if (content.relevanceScore > existingContent.relevanceScore) {
      // If we have a duplicate URL, keep the one with higher relevance score
      const index = acc.indexOf(existingContent);
      acc[index] = content;
    }
    return acc;
  }, [] as typeof result.relevantContent);

  return (
    <Card shadow="sm" p="xl" withBorder>
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={4}>{result.topic.title}</Title>
          <Badge>Score: {uniqueContent[0]?.relevanceScore.toFixed(2)}</Badge>
        </Group>

        <Text size="sm" c="dimmed">
          {result.topic.description}
        </Text>

        <Divider />

        {uniqueContent.map((content, idx) => (
          <Paper key={idx} p="md" withBorder style={resultCardHoverStyle}>
            <Stack gap="xs">
              <Text
                size="sm"
                c="blue"
                component="a"
                href={content.url}
                target="_blank"
              >
                {content.url}
              </Text>
              <Text size="md" lh={1.6}>
                {content.content}
              </Text>
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Card>
  );
}

// Add this new component before ScratchpadView
function SearchQueryCard({
  query,
  index,
  explanation,
}: {
  query: string;
  index: number;
  explanation: string;
}) {
  return (
    <Paper
      p="md"
      withBorder
      style={{
        background: "rgba(123, 34, 253, 0.03)",
        borderColor: "#2C2E33",
        transition: "all 0.2s ease",
        "&:hover": {
          background: "rgba(123, 34, 253, 0.08)",
          transform: "translateX(4px)",
        },
      }}
    >
      <Stack gap="sm">
        <Text
          style={{
            whiteSpace: "pre-wrap",
            color: "#C1C2C5",
            lineHeight: 1.5,
            fontSize: "1rem",
          }}
        >
          {query}
        </Text>
        <Text
          size="sm"
          style={{
            whiteSpace: "pre-wrap",
            color: "#909296",
            lineHeight: 1.5,
            borderTop: "1px solid rgba(123, 34, 253, 0.1)",
            paddingTop: "0.5rem",
          }}
        >
          {explanation}
        </Text>
      </Stack>
    </Paper>
  );
}

// Add this new component near the top with other components
function ScrollAreaWithFade({
  children,
  ...props
}: { children: React.ReactNode } & Record<string, any>) {
  const [showBottomFade, setShowBottomFade] = useState(false);
  const [isScrollable, setIsScrollable] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);

  const checkScroll = () => {
    if (viewport.current) {
      const { scrollTop, scrollHeight, clientHeight } = viewport.current;
      setShowBottomFade(
        scrollHeight > clientHeight && scrollTop < scrollHeight - clientHeight
      );
      setIsScrollable(scrollHeight > clientHeight);
    }
  };

  useEffect(() => {
    checkScroll();
  }, [children]);

  if (!isScrollable) {
    return <Box style={{ width: "100%", minWidth: 0 }}>{children}</Box>;
  }

  return (
    <Box style={{ position: "relative", width: "100%", minWidth: 0 }}>
      <ScrollArea
        viewportRef={viewport}
        onScrollPositionChange={checkScroll}
        style={{ width: "100%" }}
        {...props}
      >
        {children}
      </ScrollArea>
      {showBottomFade && (
        <Box
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "40px",
            background: "linear-gradient(to bottom, transparent, #1A1B1E)",
            pointerEvents: "none",
          }}
        />
      )}
    </Box>
  );
}

// Update the search queries section in ScratchpadView
function ScratchpadView({ result }: { result: ExplorationResult }) {
  const browsedUrls = Array.from(result.scratchpad.browsedUrls);
  const [activeTab, setActiveTab] = useState<"actions" | "extracts">("actions");

  const TabButton = ({
    value,
    label,
    icon,
    count,
  }: {
    value: typeof activeTab;
    label: string;
    icon?: React.ReactNode;
    count?: number;
  }) => (
    <Button
      variant={activeTab === value ? "light" : "subtle"}
      color={activeTab === value ? "violet" : "gray"}
      onClick={() => setActiveTab(value)}
      leftSection={icon}
      rightSection={count !== undefined && <Badge size="sm">{count}</Badge>}
      style={{
        flex: 1,
        backgroundColor:
          activeTab === value ? "rgba(123, 34, 253, 0.15)" : "transparent",
      }}
    >
      {label}
    </Button>
  );

  return (
    <Stack gap={0} h="100%" style={{ position: "relative" }}>
      <Box
        style={{
          position: "sticky",
          top: 0,
          backgroundColor: "#25262B",
          zIndex: 10,
          padding: "0.5rem",
        }}
      >
        <Group gap="xs">
          <TabButton
            value="actions"
            label="Research Actions"
            icon={
              <IconSearch
                size={16}
                style={{
                  color: activeTab === "actions" ? "#7B22FD" : undefined,
                }}
              />
            }
          />
          <TabButton
            value="extracts"
            label="Content Extracts"
            count={result.scratchpad.contentExtracts.length}
          />
        </Group>
      </Box>

      {activeTab === "actions" && (
        <Box p="md" style={{ width: "100%", minWidth: 0, height: "100%" }}>
          <ScrollArea h="calc(100vh - 200px)" type="always">
            <Stack gap="xs">
              {(result.scratchpad.researchActions || [])
                .sort(
                  (a, b) =>
                    new Date(b.timestamp).getTime() -
                    new Date(a.timestamp).getTime()
                )
                .map((action, idx) => (
                  <Paper
                    key={idx}
                    p="md"
                    withBorder
                    style={{
                      background: "rgba(123, 34, 253, 0.03)",
                      borderColor: "#2C2E33",
                      transition: "all 0.2s ease",
                      "&:hover": {
                        background: "rgba(123, 34, 253, 0.08)",
                        transform: "translateX(4px)",
                      },
                    }}
                  >
                    <Stack gap="sm">
                      <Group justify="space-between">
                        <Text size="xs" c="dimmed">
                          {new Date(action.timestamp).toLocaleTimeString()}
                        </Text>
                      </Group>
                      {action.action.type === "search_query" && (
                        <>
                          <Text fw={500}>Search Query</Text>
                          <Text>{action.action.query}</Text>
                          <Text
                            size="sm"
                            c="dimmed"
                            style={{ whiteSpace: "pre-wrap" }}
                          >
                            {action.reason}
                          </Text>
                        </>
                      )}
                      {action.action.type === "search_result" && (
                        <>
                          <Text fw={500}>Analyzing Search Result</Text>
                          <Text
                            component="a"
                            href={action.action.url}
                            target="_blank"
                            c="blue"
                          >
                            {action.action.title}
                          </Text>
                          <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                            {action.action.snippet}
                          </Text>
                          <Text
                            size="sm"
                            c="dimmed"
                            style={{ whiteSpace: "pre-wrap" }}
                          >
                            {action.reason}
                          </Text>
                        </>
                      )}
                      {action.action.type === "extracted_url" && (
                        <>
                          <Text fw={500}>Analyzing Referenced URL</Text>
                          <Text
                            component="a"
                            href={action.action.url}
                            target="_blank"
                            c="blue"
                          >
                            {action.action.url}
                          </Text>
                          <Text
                            size="sm"
                            c="dimmed"
                            style={{ whiteSpace: "pre-wrap" }}
                          >
                            {action.reason}
                          </Text>
                        </>
                      )}
                    </Stack>
                  </Paper>
                ))}
            </Stack>
          </ScrollArea>
        </Box>
      )}

      {activeTab === "extracts" && (
        <Box
          p="md"
          style={{
            width: "100%",
            minWidth: 0,
            height: "100%",
            overflow: "hidden",
          }}
        >
          <ScrollArea
            h="calc(100vh - 200px)"
            type="always"
            style={{ width: "100%" }}
          >
            <Box style={{ width: "100%", minWidth: 0 }}>
              <Stack gap="md" style={{ width: "100%", minWidth: 0 }}>
                {result.scratchpad.contentExtracts.map((extract, idx) => (
                  <Paper
                    key={idx}
                    p="md"
                    withBorder
                    style={{
                      background: "rgba(123, 34, 253, 0.03)",
                      borderColor: "#2C2E33",
                      width: "100%",
                      minWidth: 0,
                      maxWidth: "100%",
                      overflow: "hidden",
                    }}
                  >
                    <Stack gap="sm" style={{ width: "100%", minWidth: 0 }}>
                      <Box style={{ width: "100%", minWidth: 0 }}>
                        <Group
                          wrap="wrap"
                          gap="xs"
                          mb="xs"
                          style={{ width: "100%" }}
                        >
                          <Box
                            style={{
                              flex: "1 1 auto",
                              minWidth: 0,
                              maxWidth: "100%",
                            }}
                          >
                            <Text
                              size="sm"
                              component="a"
                              href={extract.url}
                              target="_blank"
                              c="blue"
                              style={{
                                wordBreak: "break-all",
                                overflowWrap: "break-word",
                                display: "block",
                                width: "100%",
                                maxWidth: "100%",
                              }}
                            >
                              {extract.url}
                            </Text>
                          </Box>
                          <Box style={{ flex: "0 0 auto" }}>
                            <Badge
                              variant="gradient"
                              gradient={{
                                from: "#7B22FD",
                                to: "#6200EE",
                                deg: 45,
                              }}
                            >
                              Score: {extract.relevanceScore.toFixed(2)}
                            </Badge>
                          </Box>
                        </Group>
                      </Box>
                      <Text
                        size="sm"
                        style={{
                          whiteSpace: "pre-wrap",
                          overflowWrap: "break-word",
                          wordBreak: "break-word",
                          lineHeight: 1.6,
                          color: "#C1C2C5",
                          width: "100%",
                          maxWidth: "100%",
                        }}
                      >
                        {extract.content}
                      </Text>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Box>
          </ScrollArea>
        </Box>
      )}
    </Stack>
  );
}

// Modify TopicTree component to handle clicks
function TopicTree({
  node,
  onTopicClick,
  selectedTopicId,
  index,
  currentTopicId,
}: {
  node: TopicNode;
  onTopicClick?: (id: string) => void;
  selectedTopicId?: string;
  index: number;
  currentTopicId: string | null;
}) {
  const isBeingExplored = node.id === currentTopicId;
  const isSelected = node.id === selectedTopicId;
  const isCompleted = node.urls.length > 0 && !isBeingExplored;
  const notStarted = !isBeingExplored && node.urls.length === 0;

  // Get the appropriate background color based on topic state
  const getBackgroundColor = () => {
    if (isCompleted) return "rgba(52, 199, 89, 0.08)"; // Light green for completed
    if (isSelected) return "rgba(123, 34, 253, 0.05)"; // Light purple for selected
    return "transparent";
  };

  // Get the appropriate border color based on topic state
  const getBorderColor = () => {
    if (isBeingExplored) return "#37B24D"; // Green for active exploration
    if (isCompleted) return "#34C759"; // Brighter green for completed
    return "#909296"; // Gray for not started
  };

  // Get the appropriate icon based on topic state
  const getStatusIcon = () => {
    if (isBeingExplored) return <Loader size="xs" color="#37B24D" />;
    if (isCompleted)
      return (
        <Box
          style={{
            background: "#34C759",
            borderRadius: "50%",
            width: "20px",
            height: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <IconCheck size={12} style={{ color: "white" }} />
        </Box>
      );
    return <IconCircleDot size={16} style={{ color: "#909296" }} />;
  };

  return (
    <Paper
      p="xs"
      mb="xs"
      withBorder
      onClick={() => onTopicClick?.(node.id)}
      style={{
        backgroundColor: getBackgroundColor(),
        borderLeft: `4px solid ${getBorderColor()}`,
        cursor: onTopicClick ? "pointer" : "default",
        transition: "all 0.2s ease",
        backdropFilter: "blur(10px)",
        opacity: notStarted ? 0.7 : 1,
        "&:hover": {
          backgroundColor: isCompleted
            ? "rgba(52, 199, 89, 0.12)"
            : "rgba(123, 34, 253, 0.05)",
          transform: "translateX(4px)",
          opacity: 0.9,
        },
      }}
    >
      <Group gap="md" wrap="nowrap" justify="space-between">
        <Group gap="md" wrap="nowrap">
          <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
            {index + 1}
          </Text>
          <Group gap="xs" wrap="nowrap">
            {getStatusIcon()}
            <Text size="sm" fw={500}>
              {node.title}
              {isBeingExplored && (
                <Text span size="xs" ml="xs" c="green">
                  (exploring...)
                </Text>
              )}
            </Text>
          </Group>
        </Group>
        <Group gap="md" wrap="nowrap">
          {node.tokenCount !== undefined && (
            <Badge
              size="sm"
              variant="light"
              color={node.tokenCount >= 30000 ? "red" : "blue"}
              style={{
                minWidth: "85px",
                textAlign: "center",
                whiteSpace: "nowrap",
              }}
            >
              {formatTokenCount(node.tokenCount)}T
            </Badge>
          )}
        </Group>
      </Group>
    </Paper>
  );
}

// Add token formatting helper
const formatTokenCount = (count: number): string => {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(2)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(2)}K`;
  }
  return count.toString();
};

// Add token usage display component
const TokenUsageDisplay = ({ usage }: { usage: TokenUsage }) => {
  // Calculate costs
  const inputCost = (usage.promptTokens / 1000000) * 1.1;
  const outputCost = (usage.completionTokens / 1000000) * 4.4;
  const totalCost = inputCost + outputCost;

  // Add ref for previous cost to detect changes
  const prevCostRef = useRef(totalCost);
  const [isPulsing, setIsPulsing] = useState(false);

  // Check for cost increase and trigger animation
  useEffect(() => {
    if (totalCost > prevCostRef.current) {
      setIsPulsing(true);
      const timer = setTimeout(() => setIsPulsing(false), 1000);
      return () => clearTimeout(timer);
    }
    prevCostRef.current = totalCost;
  }, [totalCost]);

  return (
    <Stack gap="xs" align="center">
      <Badge
        variant="gradient"
        gradient={{ from: "#7B22FD", to: "#6200EE", deg: 45 }}
        size="md"
        style={{
          transform: isPulsing ? "scale(1.1)" : "scale(1)",
          transition: "transform 0.15s ease",
        }}
      >
        💸 ${totalCost.toFixed(2)}
      </Badge>
      <Group gap="xs" justify="center">
        <Box>
          <Text size="xs" c="dimmed" ta="center">
            Input
          </Text>
          <Text size="xs" c="violet.2" ta="center">
            {formatTokenCount(usage.promptTokens)}
          </Text>
        </Box>
        <Box>
          <Text size="xs" c="dimmed" ta="center">
            Output
          </Text>
          <Text size="xs" c="violet.2" ta="center">
            {formatTokenCount(usage.completionTokens)}
          </Text>
        </Box>
      </Group>
    </Stack>
  );
};

// Add AgentStatus component
const AgentStatus = ({ status }: { status: string }) => (
  <Paper
    p="md"
    withBorder
    style={{
      background:
        "linear-gradient(45deg, rgba(123, 34, 253, 0.1) 0%, rgba(98, 0, 238, 0.05) 100%)",
      borderColor: "#7B22FD",
      backdropFilter: "blur(10px)",
    }}
  >
    <Group gap="md" align="center">
      <Text size="sm" style={{ flex: 1 }} c="violet.2">
        {status}
      </Text>
    </Group>
  </Paper>
);

// Add the custom modal component
function ReportModal({
  isOpen,
  onClose,
  sections,
}: {
  isOpen: boolean;
  onClose: () => void;
  sections: ReportSection[];
}) {
  if (!isOpen) return null;

  // Convert sections to markdown format
  const reportMarkdown = sections
    .map((section) => {
      return `# ${section.title}\n\n${section.content}\n\n${
        section.citations
          ? `## Sources\n\n${section.citations
              .map(
                (citation) =>
                  `- [${citation.title}](${citation.url})\n  ${citation.snippet}`
              )
              .join("\n\n")}`
          : ""
      }`;
    })
    .join("\n\n---\n\n");

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "#1A1B1E",
        zIndex: 1000,
        overflow: "auto",
        padding: "2rem",
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          backgroundColor: "#25262B",
          borderRadius: "8px",
          padding: "2rem",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)",
        }}
      >
        <Group justify="space-between" mb="xl">
          <Title order={1}>Research Report</Title>
          <Button
            variant="subtle"
            color="gray"
            onClick={onClose}
            leftSection={<IconX size={20} />}
          >
            Close
          </Button>
        </Group>

        <div style={{ color: "#C1C2C5", fontSize: "1.1rem", lineHeight: 1.6 }}>
          <ReactMarkdown>{reportMarkdown}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

export default function ResearchInterface() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ExplorationResult[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [topicTree, setTopicTree] = useState<TopicNode[]>([]);
  const [agentStatus, setAgentStatus] = useState<string>("");
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  });
  const [unifiedSpec, setUnifiedSpec] = useState<{
    query: string;
    intent: string;
    clarifications: Record<string, string>;
  } | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const currentTopicRef = useRef<string | null>(null);
  const topicParentMapRef = useRef<Map<string, string>>(new Map());
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [topicResults, setTopicResults] = useState<
    Map<string, ExplorationResult>
  >(new Map());
  const [isSpecExpanded, setIsSpecExpanded] = useState(false);
  const [clarificationQuestions, setClarificationQuestions] = useState<
    string[]
  >([]);
  const [clarificationAnswers, setClarificationAnswers] = useState<
    Record<string, string>
  >({});
  const [showClarifications, setShowClarifications] = useState(false);
  const [reportSections, setReportSections] = useState<ReportSection[]>([]);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // Cleanup function for EventSource
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const form = useForm<ResearchRequest>({
    initialValues: {
      query: "",
      depth: 2,
      saveLogs: true,
    },
    validate: {
      query: (value) =>
        value.length < 10 ? "Query must be at least 10 characters long" : null,
      depth: (value) =>
        value && (value < 1 || value > 5)
          ? "Depth must be between 1 and 5"
          : null,
    },
  });

  const handleSubmit = async (values: ResearchRequest) => {
    setLoading(true);
    setResults([]);
    setLogs([]);
    setTopicTree([]);
    setTopicResults(new Map());
    setUnifiedSpec(null);
    setTokenUsage({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
    currentTopicRef.current = null;

    try {
      // Start the research process and get a session ID
      const response = await fetch("/api/research", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error("Research request failed");
      }

      const { sessionId } = await response.json();

      // Close any existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      // Connect to the SSE endpoint with retry logic
      const connectEventSource = (retryCount = 0) => {
        console.log(`Connecting to EventSource (attempt ${retryCount + 1})...`);
        const eventSource = new EventSource(
          `/api/research/progress?sessionId=${sessionId}`
        );
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
          console.log("SSE connection established successfully");
          setTopicTree((prev) => {
            console.log("Current topic tree:", prev);
            return prev;
          });
        };

        eventSource.onmessage = (event) => {
          console.log("Raw SSE message received:", event.data);
          const data = JSON.parse(event.data) as ProgressEvent;
          console.log("Parsed SSE message:", data);
          const timestamp = new Date().toISOString();

          // Update token usage if available
          if (data.data?.tokenUsage) {
            setTokenUsage(data.data.tokenUsage);
          }

          switch (data.type) {
            case "connected":
              console.log("Research stream connected and ready");
              break;

            case "token_update":
              if (data.data?.tokenUsage) {
                console.log(
                  "Token usage update received:",
                  data.data.tokenUsage
                );
                setTokenUsage(data.data.tokenUsage);
              }
              break;

            case "topic":
              if (data.data?.topic) {
                console.log("Received topic event:", data.data.topic);
                const topicId = data.data.topic.id || crypto.randomUUID();
                const title = data.data.topic.title;
                const description = data.data.topic.description || "";
                const tokenCount = data.data.topic.tokenCount || 0;
                const status = data.data.topic.status;

                console.log("Processing topic update:", {
                  title,
                  topicId,
                  tokenCount,
                  status,
                });

                setTopicTree((prev) => {
                  const existingTopicIndex = prev.findIndex(
                    (t) => t.id === topicId
                  );
                  if (existingTopicIndex !== -1) {
                    // Update existing topic
                    const newTree = [...prev];
                    newTree[existingTopicIndex] = {
                      ...newTree[existingTopicIndex],
                      title,
                      tokenCount,
                      status,
                    };
                    console.log(
                      "Updated topic in tree:",
                      newTree[existingTopicIndex]
                    );
                    return newTree;
                  }

                  // Add new topic
                  const newTopic = {
                    id: topicId,
                    title,
                    timestamp: new Date().toISOString(),
                    urls: [],
                    subtopics: [],
                    depth: 1,
                    tokenCount,
                    status,
                  };
                  console.log("Adding new topic to tree:", newTopic);

                  // Add to the end of the array to maintain order
                  const newTree = [...prev, newTopic];
                  console.log("New topic tree:", newTree);
                  return newTree;
                });

                // Update current topic reference when status is "exploring"
                if (status === "exploring") {
                  console.log("Setting current topic to exploring:", topicId);
                  currentTopicRef.current = topicId;
                }
              }
              break;

            case "content_extract":
              if (currentTopicRef.current && data.data?.contentExtract) {
                const topicId = currentTopicRef.current;
                const newExtract = { ...data.data.contentExtract };

                // Update topic result with new content extract
                updateTopicResult(topicId, (result) => {
                  const updatedResult = {
                    ...result,
                    scratchpad: {
                      ...result.scratchpad,
                      contentExtracts: [
                        ...result.scratchpad.contentExtracts,
                        newExtract,
                      ],
                    },
                    relevantContent: [...result.relevantContent, newExtract],
                  };

                  // Calculate new token count
                  const newTokenCount =
                    updatedResult.scratchpad.contentExtracts.reduce(
                      (acc, extract) => acc + (extract.contentTokenCount || 0),
                      0
                    );

                  return {
                    ...updatedResult,
                    topic: {
                      ...updatedResult.topic,
                      tokenCount: newTokenCount,
                    },
                  };
                });
              }
              break;

            case "complete":
              console.log("Research completed:", data.data);
              if (data.data?.results) {
                setResults(data.data.results);
                // Build a map of all topics and their results
                const resultMap = new Map<string, ExplorationResult>();
                const mapResults = (result: ExplorationResult) => {
                  resultMap.set(result.topic.id, result);
                };
                data.data.results.forEach(mapResults);
                setTopicResults(resultMap);

                if (data.data.logs) {
                  setLogs(data.data.logs);
                }
                eventSource.close();
                eventSourceRef.current = null;
                setLoading(false);
                notifications.show({
                  title: "Success",
                  message: "Research completed successfully",
                  color: "green",
                });
              }
              break;

            case "error":
              console.error("Research error:", data.error);
              eventSource.close();
              eventSourceRef.current = null;
              setLoading(false);
              notifications.show({
                title: "Error",
                message: data.error || "An error occurred",
                color: "red",
              });
              break;

            case "agent_status":
              if (data.data?.agentStatus) {
                setAgentStatus(data.data.agentStatus);
              }
              break;

            case "unified_spec":
              if (data.data?.unifiedSpec) {
                setUnifiedSpec({
                  query: data.data.unifiedSpec.query,
                  intent: data.data.unifiedSpec.unifiedIntent,
                  clarifications: data.data.unifiedSpec.clarifications,
                });
                setShowClarifications(false);
              }
              break;

            case "clarifying_questions":
              if (data.data?.questions) {
                setClarificationQuestions(data.data.questions);
                setShowClarifications(true);
                const initialAnswers = data.data.questions.reduce(
                  (acc: Record<string, string>, q: string) => ({
                    ...acc,
                    [q]: "",
                  }),
                  {}
                );
                setClarificationAnswers(initialAnswers);
                // Update token usage from clarifying questions generation
                if (data.data?.tokenUsage) {
                  setTokenUsage(data.data.tokenUsage);
                }
              }
              break;

            case "research_action":
              if (currentTopicRef.current && data.data?.researchAction) {
                const topicId = currentTopicRef.current;
                const newAction = data.data.researchAction;
                updateTopicResult(topicId, (result) => ({
                  ...result,
                  scratchpad: {
                    ...result.scratchpad,
                    researchActions: [
                      ...(result.scratchpad.researchActions || []),
                      newAction,
                    ],
                  },
                }));
              }
              break;

            case "report_section":
              if (data.data?.section) {
                setReportSections((prev) => [
                  ...prev,
                  data.data!.section as ReportSection,
                ]);
              }
              break;

            case "report_complete":
              if (data.data?.sections) {
                setReportSections(data.data.sections as ReportSection[]);
                setIsReportModalOpen(true);
              }
              break;
          }
        };

        eventSource.onerror = (error) => {
          console.error("SSE connection error:", error);
          eventSource.close();
          eventSourceRef.current = null;

          // Attempt to reconnect up to 3 times with exponential backoff
          if (retryCount < 3) {
            const delay = Math.min(1000 * Math.pow(2, retryCount), 5000);
            console.log(
              `Will retry connection in ${delay}ms (attempt ${
                retryCount + 1
              }/3)`
            );
            setTimeout(() => connectEventSource(retryCount + 1), delay);
          } else {
            console.error("Max retry attempts reached, giving up");
            setLoading(false);
            notifications.show({
              title: "Connection Error",
              message: "Lost connection to the server. Please try again.",
              color: "red",
            });
          }
        };
      };

      // Start the initial connection
      connectEventSource();
    } catch (error) {
      setLoading(false);
      notifications.show({
        title: "Error",
        message: error instanceof Error ? error.message : "An error occurred",
        color: "red",
      });
    }
  };

  // Helper function to find a topic by ID in the tree
  const findTopicById = (tree: TopicNode[], id: string): TopicNode | null => {
    for (const node of tree) {
      if (node.id === id) return node;
      const found = findTopicInSubtopics(node.subtopics, id);
      if (found) return found;
    }
    return null;
  };

  const findTopicInSubtopics = (
    subtopics: TopicNode[],
    id: string
  ): TopicNode | null => {
    for (const node of subtopics) {
      if (node.id === id) return node;
      const found = findTopicInSubtopics(node.subtopics, id);
      if (found) return found;
    }
    return null;
  };

  // Add this helper function to find a topic by title at any level
  const findTopicByTitle = (
    tree: TopicNode[],
    title: string
  ): TopicNode | null => {
    for (const node of tree) {
      if (node.title === title) return node;
      const found = findTopicByTitleInSubtopics(node.subtopics, title);
      if (found) return found;
    }
    return null;
  };

  const findTopicByTitleInSubtopics = (
    subtopics: TopicNode[],
    title: string
  ): TopicNode | null => {
    for (const node of subtopics) {
      if (node.title === title) return node;
      const found = findTopicByTitleInSubtopics(node.subtopics, title);
      if (found) return found;
    }
    return null;
  };

  // Add helper to update topic result
  const updateTopicResult = (
    topicId: string,
    updateFn: (result: ExplorationResult) => ExplorationResult
  ) => {
    setTopicResults((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(topicId);
      if (existing) {
        newMap.set(topicId, updateFn(existing));
      } else {
        // Create a new result if it doesn't exist
        newMap.set(
          topicId,
          updateFn({
            topic: {
              id: topicId,
              title: "",
              description: "",
              searchQueries: [],
            },
            relevantContent: [],
            scratchpad: {
              topicId: topicId,
              browsedUrls: new Set(),
              searchResults: [],
              contentExtracts: [],
            },
          })
        );
      }
      return newMap;
    });
  };

  const handleClarificationSubmit = async () => {
    // Check if all questions are answered
    const allAnswered = clarificationQuestions.every((q) =>
      clarificationAnswers[q]?.trim()
    );
    if (!allAnswered) {
      notifications.show({
        title: "Missing Answers",
        message: "Please answer all clarification questions",
        color: "red",
      });
      return;
    }

    // Extract sessionId from EventSource URL
    const sessionId =
      eventSourceRef.current?.url?.match(/sessionId=([^&]*)/)?.[1];
    if (!sessionId) {
      notifications.show({
        title: "Error",
        message: "Session ID not found",
        color: "red",
      });
      return;
    }

    try {
      const response = await fetch("/api/research/clarify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          answers: clarificationAnswers,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit clarifications");
      }

      setShowClarifications(false);
      // Continue with research process...
    } catch (error) {
      notifications.show({
        title: "Error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to submit clarifications",
        color: "red",
      });
    }
  };

  // Add hotkey handler for Command+Enter
  useHotkeys([
    [
      "mod+Enter",
      () => {
        if (!loading && form.isValid()) {
          form.onSubmit(handleSubmit)();
        }
      },
    ],
  ]);

  return (
    <>
      <AppShell
        style={{
          padding: 0,
          margin: 0,
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
        }}
      >
        <AppShell.Main style={containerStyle}>
          <Container
            size="xl"
            w="100%"
            maw={1400}
            mx="auto"
            h="100%"
            p="md"
            style={{
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <Stack gap="xl" style={{ flex: "0 0 auto" }}>
              <Center mb="xl">
                <Group
                  gap="xl"
                  align="center"
                  justify="space-between"
                  w="100%"
                  px="md"
                  h={80}
                >
                  <Group gap="md" align="center">
                    <Title
                      order={1}
                      size="h1"
                      style={{
                        background:
                          "linear-gradient(45deg, #AE7AFF 0%, #6200EE 100%)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                      }}
                    >
                      researchG
                      <Text
                        span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background:
                            "linear-gradient(45deg, rgba(174, 122, 255, 0.2), rgba(98, 0, 238, 0.2))",
                          borderRadius: "50%",
                          width: "1.1em",
                          height: "1.1em",
                          margin: "0 0.1em",
                          fontSize: "0.8em",
                          backdropFilter: "blur(4px)",
                          border: "3px solid rgba(174, 122, 255, 0.3)",
                          boxShadow: "0 2px 8px rgba(123, 34, 253, 0.2)",
                          WebkitBackgroundClip: "content-box",
                          WebkitTextFillColor: "initial",
                        }}
                      >
                        😇
                      </Text>
                      d
                    </Title>
                  </Group>
                  <TokenUsageDisplay usage={tokenUsage} />
                </Group>
              </Center>

              {!loading ? (
                <Card shadow="sm" p="xl" radius="md" withBorder>
                  <form onSubmit={form.onSubmit(handleSubmit)}>
                    <Stack gap="xl">
                      <Textarea
                        required
                        label="Research Query"
                        description="Enter your research question in detail"
                        placeholder="What are the recent advances in quantum magnetometers? Include developments in sensitivity, applications, and key technological breakthroughs..."
                        {...form.getInputProps("query")}
                        minRows={3}
                        autosize
                        size="md"
                        styles={textAreaStyles}
                        onKeyDown={(event) => {
                          if (
                            (event.metaKey || event.ctrlKey) &&
                            event.key === "Enter"
                          ) {
                            event.preventDefault();
                            if (!loading && form.isValid()) {
                              form.onSubmit(handleSubmit)();
                            }
                          }
                        }}
                      />

                      <Group grow align="flex-start" gap="xl">
                        <NumberInput
                          label="Research Depth"
                          description="Higher depth means more thorough research (1-5)"
                          min={1}
                          max={5}
                          {...form.getInputProps("depth")}
                          size="md"
                          styles={numberInputStyles}
                        />

                        <Switch
                          label="Save Research Logs"
                          description="Keep detailed logs of the research process"
                          {...form.getInputProps("saveLogs", {
                            type: "checkbox",
                          })}
                          size="md"
                          styles={{
                            label: {
                              marginBottom: "0.5rem",
                              fontSize: "1rem",
                              fontWeight: 500,
                            },
                            description: {
                              marginBottom: "0.5rem",
                            },
                          }}
                        />
                      </Group>

                      <Button
                        type="submit"
                        loading={loading}
                        leftSection={<IconSearch size={20} />}
                        size="lg"
                        fullWidth
                        variant="gradient"
                        gradient={{ from: "#7B22FD", to: "#6200EE", deg: 45 }}
                      >
                        Start Research{" "}
                        <Text c="rgba(255,255,255,0.7)" size="sm" span ml="xs">
                          (⌘ + ↵)
                        </Text>
                      </Button>
                    </Stack>
                  </form>
                </Card>
              ) : (
                <>
                  {showClarifications ? (
                    <Card shadow="sm" p="xl" radius="md" withBorder>
                      <Stack gap="xl">
                        <Group justify="space-between">
                          <Title order={3}>Clarification Questions</Title>
                          <Badge
                            size="lg"
                            variant="gradient"
                            gradient={{
                              from: "#7B22FD",
                              to: "#6200EE",
                              deg: 45,
                            }}
                          >
                            Waiting for Response
                          </Badge>
                        </Group>
                        <Paper
                          p="md"
                          withBorder
                          style={{
                            background: "rgba(37, 38, 43, 0.5)",
                            borderLeft: "4px solid #7B22FD",
                          }}
                        >
                          <Text size="md" style={{ fontStyle: "italic" }}>
                            "{form.values.query}"
                          </Text>
                        </Paper>
                        <Text size="lg" c="dimmed">
                          Please answer these questions to help refine the
                          research:
                        </Text>
                        <Stack gap="xl">
                          {clarificationQuestions.map((question, idx) => (
                            <Textarea
                              key={idx}
                              label={question}
                              value={clarificationAnswers[question] || ""}
                              onChange={(event) => {
                                const newAnswers = { ...clarificationAnswers };
                                newAnswers[question] = event.target.value;
                                setClarificationAnswers(newAnswers);
                              }}
                              onKeyDown={(event) => {
                                if (
                                  (event.metaKey || event.ctrlKey) &&
                                  event.key === "Enter"
                                ) {
                                  event.preventDefault();
                                  handleClarificationSubmit();
                                }
                              }}
                              placeholder="Your answer..."
                              minRows={2}
                              autosize
                              styles={textAreaStyles}
                            />
                          ))}
                          <Button
                            onClick={handleClarificationSubmit}
                            size="lg"
                            variant="gradient"
                            gradient={{
                              from: "#7B22FD",
                              to: "#6200EE",
                              deg: 45,
                            }}
                            disabled={
                              !clarificationQuestions.every((q) =>
                                clarificationAnswers[q]?.trim()
                              )
                            }
                          >
                            Submit Clarifications
                          </Button>
                        </Stack>
                      </Stack>
                    </Card>
                  ) : unifiedSpec ? (
                    <Card shadow="sm" p="md" radius="md" withBorder>
                      <Group
                        justify="space-between"
                        mb="md"
                        style={{ cursor: "pointer" }}
                        onClick={() => setIsSpecExpanded(!isSpecExpanded)}
                      >
                        <Title order={3}>Research Specification</Title>
                        <Group gap="sm">
                          <Badge size="lg">In Progress</Badge>
                          <Text size="sm" c="dimmed">
                            {isSpecExpanded
                              ? "Click to collapse"
                              : "Click to expand"}
                          </Text>
                        </Group>
                      </Group>
                      <Paper
                        p="md"
                        withBorder
                        style={{
                          background: "rgba(37, 38, 43, 0.5)",
                          borderLeft: "4px solid #7B22FD",
                        }}
                      >
                        <Text
                          style={{
                            display: isSpecExpanded ? "block" : "-webkit-box",
                            WebkitLineClamp: isSpecExpanded ? undefined : 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                            whiteSpace: "pre-wrap",
                            lineHeight: 1.6,
                          }}
                        >
                          {unifiedSpec.intent}
                        </Text>
                      </Paper>
                    </Card>
                  ) : (
                    <Card shadow="sm" p="md" radius="md" withBorder>
                      <Group gap="md">
                        <Loader size="sm" />
                        <Text>Analyzing research query...</Text>
                      </Group>
                    </Card>
                  )}
                  {agentStatus && <AgentStatus status={agentStatus} />}
                </>
              )}
            </Stack>

            <div
              style={{
                flex: 1,
                marginTop: "1rem",
                display: "flex",
                flexDirection: "row",
                gap: "1rem",
                minHeight: 0,
                position: "relative",
              }}
            >
              {/* Main Content Area */}
              <div
                style={{
                  flex: selectedTopicId ? 1.2 : 1,
                  transition: "flex 0.3s ease",
                  minWidth: 0,
                }}
              >
                <Card
                  shadow="sm"
                  p="xl"
                  radius="md"
                  withBorder
                  style={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {loading ? (
                    <>
                      <Group justify="space-between" align="flex-start" mb="md">
                        <Title order={3}>Research Progress</Title>
                        <Text size="sm" c="dimmed">
                          {topicTree.length} topics identified
                        </Text>
                      </Group>
                      <Divider my="md" />
                      <ScrollArea style={{ flex: 1 }}>
                        <Stack gap="xs">
                          {(() => {
                            const topLevelTopics = topicTree;
                            console.log(
                              "Rendering top-level topics:",
                              topLevelTopics
                            );
                            return topLevelTopics.map((topic, index) => (
                              <TopicTree
                                key={topic.id}
                                node={topic}
                                onTopicClick={setSelectedTopicId}
                                selectedTopicId={selectedTopicId || undefined}
                                index={index}
                                currentTopicId={currentTopicRef.current}
                              />
                            ));
                          })()}
                        </Stack>
                      </ScrollArea>
                    </>
                  ) : (
                    <>
                      <Group justify="space-between" mb="md">
                        <Title order={3}>Research Results</Title>
                        <Group gap="md">
                          <Text size="sm" c="dimmed">
                            {results.length} main topics explored
                          </Text>
                          <TokenUsageDisplay usage={tokenUsage} />
                        </Group>
                      </Group>
                      <Divider mb="lg" />
                      <ScrollArea>
                        <Stack gap="xl">
                          {results.map((result, index) => (
                            <ResultCard key={index} result={result} />
                          ))}
                          {logs.length > 0 && (
                            <>
                              <Divider
                                label="Research Logs"
                                labelPosition="center"
                              />
                              <Paper p="md" withBorder>
                                <ScrollArea h={200}>
                                  <Text
                                    component="pre"
                                    size="sm"
                                    style={{ whiteSpace: "pre-wrap" }}
                                  >
                                    {logs.join("\n")}
                                  </Text>
                                </ScrollArea>
                              </Paper>
                            </>
                          )}
                        </Stack>
                      </ScrollArea>
                    </>
                  )}
                </Card>
              </div>

              {/* Scratchpad Panel */}
              {selectedTopicId && (
                <Card
                  shadow="sm"
                  p="xl"
                  radius="md"
                  withBorder
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    position: "relative",
                    minWidth: 0,
                    overflow: "hidden",
                  }}
                >
                  <Title order={3} mb="md">
                    Scratchpad: {topicResults.get(selectedTopicId)?.topic.title}
                  </Title>
                  <Box style={{ flex: 1, minHeight: 0, position: "relative" }}>
                    {(() => {
                      const selectedResult = topicResults.get(selectedTopicId);
                      return selectedResult ? (
                        <ScratchpadView result={selectedResult} />
                      ) : (
                        <Text c="dimmed">Loading scratchpad content...</Text>
                      );
                    })()}
                  </Box>
                </Card>
              )}
            </div>
          </Container>
        </AppShell.Main>
      </AppShell>
      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        sections={reportSections}
      />
    </>
  );
}
