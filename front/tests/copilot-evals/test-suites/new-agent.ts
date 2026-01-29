import type { TestSuite } from "../lib/types";

export const newAgentSuite: TestSuite = {
  name: "New Agent Creation",
  description: "Tests for creating agents from scratch",
  testCases: [
    {
      scenarioId: "NEW-001",
      userMessage:
        "I need to create a customer support agent that will help users with common questions about our SaaS product. The agent should be friendly, professional, and able to handle basic troubleshooting. Please create the instructions for this agent.",
      mockState: {
        name: "",
        description: "",
        instructions: "",
        model: {
          modelId: "gpt-4-turbo",
          providerId: "openai",
          temperature: 0.7,
        },
        tools: [],
        skills: [],
      },
      expectedToolCalls: ["get_agent_info", "suggest_prompt_editions"],
      judgeCriteria: `The copilot should:
1. Recognize that the user has provided clear, complete requirements:
   - Purpose: SaaS product support
   - Tone: friendly and professional
   - Capability: handle common questions and basic troubleshooting
   - Clear directive: "Please create the instructions"
2. Have high confidence to proceed and call suggest_prompt_editions with complete, well-structured instructions that address all requirements
3. The suggested instructions should include:
   - Clear role definition (customer support for SaaS product)
   - Tone guidelines (friendly and professional)
   - Core responsibilities (answering questions, troubleshooting)
   - Response structure or best practices
4. Explain why these instructions work well for the stated use case
5. Optionally suggest relevant tools (search, documentation access) to enhance the agent`,
    },
  ],
};
