import React, { FC, ReactNode, useCallback, useEffect, useState } from "react";
import { Box, Text, useStdout, useInput } from "ink";
import Spinner from "ink-spinner";
import { getDustClient } from "../../utils/dustClient.js";
import AuthService from "../../utils/authService.js";
import { GetAgentConfigurationsResponseType } from "@dust-tt/client";
import { MultiSelectWithSearch, BaseItem } from "../components/MultiSelectWithSearch.js";
import process from "process";
import { createInterface } from "readline";

type AgentConfiguration = GetAgentConfigurationsResponseType["agentConfigurations"][number];

interface AgentItem extends BaseItem {
  description: string;
  scope?: string;
  userFavorite?: boolean;
}

interface AskAgentProps {
  sId?: string;
  question?: string;
}

const AskAgent: FC<AskAgentProps> = ({ sId: requestedSId, question: initialQuestion }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [allAgents, setAllAgents] = useState<AgentConfiguration[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentConfiguration | null>(null);
  const [question, setQuestion] = useState<string | null>(initialQuestion || null);
  const [isAskingQuestion, setIsAskingQuestion] = useState(false);
  const [isProcessingQuestion, setIsProcessingQuestion] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  const { stdout } = useStdout();

  // Clear the terminal on mount
  useEffect(() => {
    process.stdout.write("\x1bc");
  }, []);

  useEffect(() => {
    const fetchAgents = async () => {
      setIsLoading(true);
      setError(null);

      const workspaceId = await AuthService.getSelectedWorkspaceId();
      if (!workspaceId) {
        setError("No workspace selected. Run `dust login` to select a workspace.");
        setIsLoading(false);
        return;
      }

      const dustClient = await getDustClient();
      if (!dustClient) {
        setError("Authentication required. Run `dust login` first.");
        setIsLoading(false);
        return;
      }

      const agentsRes = await dustClient.getAgentConfigurations({
        view: "all",
      });

      if (agentsRes.isErr()) {
        setError(`API Error fetching agents: ${agentsRes.error.message}`);
        setIsLoading(false);
        return;
      }

      setAllAgents(agentsRes.value);

      // If a specific agent ID was requested, select it directly
      if (requestedSId) {
        const agent = agentsRes.value.find(a => a.sId === requestedSId);
        if (agent) {
          setSelectedAgent(agent);
          if (initialQuestion) {
            setIsAskingQuestion(false);
            askQuestion(agent, initialQuestion);
          } else {
            setIsAskingQuestion(true);
          }
        } else {
          setError(`Agent with ID ${requestedSId} not found.`);
        }
      }

      setIsLoading(false);
    };

    fetchAgents();
  }, [requestedSId, initialQuestion]);

  const askQuestion = async (agent: AgentConfiguration, questionText: string) => {
    setIsProcessingQuestion(true);
    setAnswer(null);

    const dustClient = await getDustClient();
    if (!dustClient) {
      setError("Authentication required. Run `dust login` first.");
      setIsProcessingQuestion(false);
      return;
    }

    // Create a conversation with the agent
    const convRes = await dustClient.createConversation({
      title: `CLI Question: ${questionText.substring(0, 30)}${questionText.length > 30 ? '...' : ''}`,
      visibility: "unlisted",
      message: {
        content: questionText,
        mentions: [{ configurationId: agent.sId }],
        context: {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          username: "cli-user",
          fullName: "CLI User",
          email: null,
          origin: "api",
        },
      },
      contentFragment: undefined,
    });

    if (convRes.isErr()) {
      setError(`Failed to create conversation: ${convRes.error.message}`);
      setIsProcessingQuestion(false);
      return;
    }

    const { conversation, message: createdUserMessage } = convRes.value;
    
    try {
      // Stream the agent's response
      const streamRes = await dustClient.streamAgentAnswerEvents({
        conversation: conversation,
        userMessageId: createdUserMessage.sId,
      });

      if (streamRes.isErr()) {
        setError(`Failed to stream agent answer: ${streamRes.error.message}`);
        setIsProcessingQuestion(false);
        return;
      }

      let responseText = "";
      for await (const event of streamRes.value.eventStream) {
        if (event.type === "generation_tokens") {
          responseText += event.text;
          setAnswer(responseText);
        } else if (event.type === "agent_error") {
          setError(`Agent error: ${event.error.message}`);
          break;
        } else if (event.type === "user_message_error") {
          setError(`User message error: ${event.error.message}`);
          break;
        } else if (event.type === "agent_message_success" || event.type === "agent_generation_success") {
          // Complete
          setIsComplete(true);
          break;
        }
      }
    } catch (error) {
      setError(`Error processing response: ${error}`);
    } finally {
      setIsProcessingQuestion(false);
    }
  };

  const handleAgentSelect = useCallback(async (selectedIds: string[]) => {
    if (selectedIds.length === 0) {
      return;
    }

    const agentId = selectedIds[0]; // Take the first selected agent
    const agent = allAgents.find(a => a.sId === agentId);
    
    if (agent) {
      setSelectedAgent(agent);
      setIsAskingQuestion(true);
    }
  }, [allAgents]);

  useEffect(() => {
    if (isAskingQuestion && !initialQuestion) {
      // Set up readline interface for question input
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      process.stdout.write("\x1bc"); // Clear screen
      
      rl.question(`What would you like to ask ${selectedAgent?.name}? `, (input) => {
        if (input.trim()) {
          setQuestion(input);
          rl.close();
          if (selectedAgent) {
            askQuestion(selectedAgent, input);
          }
        } else {
          rl.close();
          process.exit(0);
        }
      });

      return () => {
        rl.close();
      };
    }
  }, [isAskingQuestion, selectedAgent, initialQuestion]);

  const renderAgentItem = useCallback(
    (item: AgentItem, isSelected: boolean, isFocused: boolean): ReactNode => {
      const termWidth = stdout?.columns || 80;
      const descriptionIndent = 3;
      const maxDescWidth = termWidth - descriptionIndent;

      let truncatedDescription = "";
      let needsEllipsis = false;
      const originalLines = (item.description || "").split("\n");

      if (originalLines.length > 0) {
        const line1 = originalLines[0];
        if (line1.length > maxDescWidth) {
          truncatedDescription += line1.substring(0, maxDescWidth - 3) + "...";
          needsEllipsis = true;
        } else {
          truncatedDescription += line1;
        }
        if (originalLines.length > 1 && !needsEllipsis) {
          const line2 = originalLines[1];
          truncatedDescription += "\n";
          if (line2.length > maxDescWidth) {
            truncatedDescription +=
              line2.substring(0, maxDescWidth - 3) + "...";
            needsEllipsis = true;
          } else {
            truncatedDescription += line2;
          }
        }
        if (originalLines.length > 2 && !needsEllipsis) {
          truncatedDescription += "\n...";
        }
      }

      const indicator = isFocused ? "> " : "  ";
      const selectionMark = isSelected ? "x" : " ";

      return (
        <Box key={item.id} flexDirection="column">
          <Text color={isFocused ? "blue" : undefined}>
            {`${indicator}[`}
            <Text bold={isSelected}>{selectionMark}</Text>
            {`] ${item.label} (${item.id})`}
          </Text>
          {truncatedDescription && (
            <Box marginLeft={descriptionIndent}>
              <Text dimColor>{truncatedDescription}</Text>
            </Box>
          )}
        </Box>
      );
    },
    [stdout?.columns]
  );

  // Handle 'q' key press to quit
  useInput((input, key) => {
    if (input === "q" && !isAskingQuestion) {
      process.exit(0);
    }
  });

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  if (isLoading) {
    return (
      <Box>
        <Text color="green">
          <Spinner type="dots" /> Loading agents...
        </Text>
      </Box>
    );
  }

  if (isProcessingQuestion) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Agent: </Text>
          <Text>{selectedAgent?.name}</Text>
        </Box>
        <Box marginBottom={1}>
          <Text bold>Question: </Text>
          <Text>{question}</Text>
        </Box>
        <Box marginBottom={1}>
          <Text color="green">
            <Spinner type="dots" /> Getting answer...
          </Text>
        </Box>
        {answer && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Response:</Text>
            <Box marginTop={1} flexDirection="column">
              <Text>{answer}</Text>
            </Box>
          </Box>
        )}
      </Box>
    );
  }

  if (answer !== null) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Agent: </Text>
          <Text>{selectedAgent?.name}</Text>
        </Box>
        <Box marginBottom={1}>
          <Text bold>Question: </Text>
          <Text>{question}</Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Response:</Text>
          <Box marginTop={1} flexDirection="column">
            <Text>{answer}</Text>
          </Box>
        </Box>
        <Box marginTop={2}>
          <Text dimColor>Press 'q' to exit.</Text>
        </Box>
      </Box>
    );
  }

  if (!selectedAgent && !requestedSId) {
    const agentItems: AgentItem[] = allAgents.map((agent) => ({
      id: agent.sId,
      label: agent.name,
      description: agent.description,
    }));

    return (
      <Box flexDirection="column">
        <Text bold>Select an agent to ask a question:</Text>
        <Box marginTop={1}>
          <MultiSelectWithSearch<AgentItem>
            items={agentItems}
            onConfirm={handleAgentSelect}
            renderItem={renderAgentItem}
            itemLines={4}
            legRoom={7}
            searchPrompt="Search Agents:"
            selectPrompt="Select an Agent"
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <Text color="green">
        <Spinner type="dots" /> Loading...
      </Text>
    </Box>
  );
};

export default AskAgent;