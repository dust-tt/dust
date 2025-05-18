import {
  AgentMessageContentParser,
  getDelimitersConfiguration,
} from "@app/lib/api/assistant/agent_message_content_parser";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { Authenticator } from "@app/lib/auth";

async function main() {
  const tokens = [
    "<think",
    "ing",
    ">",
    "\n",
    "Need",
    " general",
    " info",
    " about",
    " Unity",
    " vs",
    " Un",
    "real",
    " mobile",
    " development",
    " ->",
    " web",
    " search",
    "\n",
    "</",
    "thinking",
    ">",
  ];

  const agentConfig = await getAgentConfiguration(
    await Authenticator.internalAdminForWorkspace("WNp5rb4EIx"),
    "dust",
    "light"
  );

  if (!agentConfig) {
    throw new Error("Agent config not found");
  }

  const delConfig = await getDelimitersConfiguration({
    agentConfiguration: agentConfig,
  });

  const parser = new AgentMessageContentParser(agentConfig, "123", delConfig);

  const result: any[] = [];

  for (const token of tokens) {
    for await (const event of parser.emitTokens(token)) {
      result.push(event);
    }
  }

  for await (const event of parser.flushTokens()) {
    result.push(event);
  }

  console.log(result);
}

main().catch(console.error);
