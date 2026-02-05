/**
 * Quick test script for the high-level SDK API.
 *
 * Usage:
 *   DUST_API_KEY="your_key" DUST_WORKSPACE_ID="your_workspace" npx ts-node test-sdk.ts
 */

import { DustAPI } from "./src/index";
import { DustAgentError, DustCancelledError, DustError } from "./src/errors";

const workspaceId = process.env.DUST_WORKSPACE_ID;
const apiKey = process.env.DUST_API_KEY;

if (!workspaceId || !apiKey) {
  console.error(
    "Please set DUST_WORKSPACE_ID and DUST_API_KEY environment variables"
  );
  process.exit(1);
}

const baseUrl = process.env.DUST_API_URL || "http://localhost:3000";

const dust = new DustAPI({ workspaceId, apiKey, baseUrl });

async function testSendMessage(): Promise<void> {
  console.log("=== Test 1: Simple sendMessage ===\n");

  const key = await dust.getApiKey();
  console.log("API Key accessible:", key ? `${key.slice(0, 8)}...` : "NULL");

  const response = await dust.agents.sendMessage({
    agentId: "dust",
    message: "What is 2 + 2? Reply with just the number.",
    context: {
      username: "Jules",
      email: "jules@dust.tt",
      fullName: "Jules",
    },
  });

  console.log("Response:", response.text);
  console.log("Conversation ID:", response.conversationId);
  console.log("Message ID:", response.messageId);
  console.log();
}

async function testStreaming(): Promise<void> {
  console.log("=== Test 2: Streaming ===\n");

  let tokenCount = 0;
  const stream = dust.agents
    .streamMessage({
      agentId: "dust",
      message: "Count from 1 to 5, one number per line.",
    })
    .on("text", (delta) => {
      process.stdout.write(delta);
      tokenCount++;
    })
    .on("error", (err) => {
      console.error("\nStream error:", err.message);
    });

  const final = await stream.finalMessage();
  console.log(`\n\nReceived ${tokenCount} text events`);
  console.log("Final text length:", final.text.length);
  console.log();
}

async function testConversationContinuation(): Promise<void> {
  console.log("=== Test 3: Conversation Continuation ===\n");

  const response1 = await dust.agents.sendMessage({
    agentId: "dust",
    message: "Remember the number 42.",
  });
  console.log("First response:", response1.text.slice(0, 100));

  const response2 = await dust.agents.sendMessage({
    agentId: "dust",
    message: "What number did I ask you to remember?",
    conversationId: response1.conversationId,
  });
  console.log("Second response:", response2.text.slice(0, 100));
  console.log();
}

async function testErrorHandling(): Promise<void> {
  console.log("=== Test 4: Error Handling ===\n");

  try {
    await dust.agents.sendMessage({
      agentId: "nonexistent_agent_12345",
      message: "This should fail",
    });
  } catch (error) {
    if (error instanceof DustError) {
      console.log(`Caught ${error.constructor.name}:`, error.message);
    } else {
      console.log("Caught unexpected error:", error);
    }
  }
  console.log();
}

async function testToolApproval(): Promise<void> {
  console.log("=== Test 5: Tool Approval Callback ===\n");

  let approvalRequested = false;

  const stream = dust.agents
    .streamMessage({
      agentId: "dust",
      message: "What time is it?",
    })
    .on("text", (delta) => {
      process.stdout.write(delta);
    })
    .on("toolApprovalRequired", async (approval) => {
      approvalRequested = true;
      console.log("\n[Tool approval requested]");
      console.log(`  Tool: ${approval.toolName}`);
      console.log(`  Server: ${approval.serverName}`);
      console.log(`  Input: ${JSON.stringify(approval.input)}`);
      console.log("  -> Auto-approving for test");
      await approval.approve();
      return true;
    })
    .on("action", (action) => {
      console.log(`\n[Action: ${action.toolName}] Status: ${action.status}`);
    });

  await stream.finalMessage();

  if (approvalRequested) {
    console.log("\nTool approval was requested and handled.");
  } else {
    console.log("\nNo tool approval was needed for this request.");
  }
  console.log();
}

async function testCancellation(): Promise<void> {
  console.log("=== Test 6: Cancellation ===\n");

  const controller = new AbortController();

  const stream = dust.agents
    .streamMessage({
      agentId: "dust",
      message: "Write a very long story about a space adventure.",
      signal: controller.signal,
    })
    .on("text", (delta) => {
      process.stdout.write(delta);
    });

  setTimeout(() => {
    console.log("\n[Cancelling...]");
    controller.abort();
  }, 500);

  try {
    await stream.finalMessage();
  } catch (error) {
    const isCancellationError =
      error instanceof DustCancelledError ||
      (error instanceof DustAgentError && error.message.includes("ended")) ||
      (error instanceof Error && error.message.includes("cancelled"));

    if (isCancellationError) {
      console.log("Stream was cancelled (expected)");
    } else {
      throw error;
    }
  }
  console.log();
}

async function main(): Promise<void> {
  console.log("Dust SDK High-Level API Test\n");
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Workspace: ${workspaceId}`);
  console.log(`API Key: ${apiKey.slice(0, 8)}...`);
  console.log("\n" + "=".repeat(50) + "\n");

  await testSendMessage();
  await testStreaming();
  await testConversationContinuation();
  await testErrorHandling();
  await testToolApproval();
  await testCancellation();

  console.log("=".repeat(50));
  console.log("All tests completed!");
}

main().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
