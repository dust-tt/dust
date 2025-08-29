#!/usr/bin/env ts-node

/**
 * Simple test script to verify webhook integration
 * Run with: npm run test-webhook
 */

import axios from "axios";

async function testWebhook() {
  const webhookUrl =
    process.env.WEBHOOK_URL ||
    "http://localhost:3002/webhooks/mywebhooksecret/teams_bot";

  const testPayload = {
    type: "message",
    tenantId: "test-tenant-id",
    activity: {
      type: "message",
      id: "test-message-id",
      timestamp: new Date().toISOString(),
      channelId: "19:test-channel-id",
      from: {
        id: "29:test-user-id",
        name: "Test User",
        aadObjectId: "test-aad-object-id",
      },
      conversation: {
        id: "19:test-conversation-id",
        name: "Test Conversation",
        conversationType: "personal",
        tenantId: "test-tenant-id",
      },
      recipient: {
        id: "28:test-bot-id",
        name: "Dust Bot",
      },
      text: "@dust Hello, this is a test message",
      textFormat: "plain",
      locale: "en-US",
    },
  };

  try {
    console.log(`Testing webhook at: ${webhookUrl}`);
    console.log(`Payload:`, JSON.stringify(testPayload, null, 2));

    const response = await axios.post(webhookUrl, testPayload, {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 5000,
    });

    console.log(`✅ Success! Status: ${response.status}`);
    console.log(`Response:`, response.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.log(
        `❌ Error: ${error.response?.status} - ${error.response?.statusText}`
      );
      console.log(`Response:`, error.response?.data);
    } else {
      console.log(`❌ Error:`, error.message);
    }
  }
}

if (require.main === module) {
  testWebhook();
}
