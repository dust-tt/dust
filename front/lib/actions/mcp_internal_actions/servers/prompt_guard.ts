import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  makeInternalMCPServer,
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import { MCPError } from "@app/lib/actions/mcp_errors";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { decrypt, Ok, Err } from "@app/types";
import logger from "@app/logger/logger";  // add this import
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import { DustAppSecret } from "@app/lib/models/dust_app_secret";

import tracer from 'dd-trace'; 

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = makeInternalMCPServer("prompt_guard");

  const makeLakeraRequest = async (
    endpoint: string,
    message: string,
    apiKey: string
  ): Promise<any> => {
    const url = new URL(`https://api.lakera.ai/v2/${endpoint}`);

    const LakeraBody = {
        messages:[{content: message, role: "user"}]
    };
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(LakeraBody)
    });
    if (!response.ok) {
      const errorBody = await response.text();
      if (response.status === 401) {
        throw new MCPError(
          "Invalid API key."
        );
      } else if (response.status === 403) {
        throw new MCPError(
          "Insufficient permissions."
        );
      } else if (response.status === 429) {
        throw new MCPError(
          "Lakera API rate limit exceeded. Please try again later."
        );
      }
      throw new MCPError(`Lakera API error (${response.status}): ${errorBody}`);
    }

    return response.json();
  };

  const datadogAIGuardSDK = async (message: string,
    apiKey: string,
    applicationKey: string
  ): Promise<any> => {
    //{"role":"assistant","content":"How can I help you today?"} 
    //{"role":"assistant", "content":"","tool_calls": [{"id": "call_123","function": {"name": "shell", "arguments": "{\"command\":\"ls\"}"}}]}
  const result = await tracer.aiguard.evaluate([ 
    { role: 'system', content: 'You are an AI Assistant' }, 
    { role: 'user', content: message } 
  ], 
    { block: false } 
  );
    if (!result.action) {
      throw new MCPError(`Datadog error (${result})`);
    }

    return result;
  };


  const datadogAIGuardAPI = async (message: string,
    apiKey: string,
    applicationKey: string
  ): Promise<any> => {
      const url = new URL(`https://app.datadoghq.eu/api/v2/ai-guard/evaluate`);
    //{"role":"assistant","content":"How can I help you today?"} 
    //{"role":"assistant", "content":"","tool_calls": [{"id": "call_123","function": {"name": "shell", "arguments": "{\"command\":\"ls\"}"}}]}
    const DatadogBody = {"data": { "attributes": { "messages": [ {role: 'user', content: message }]}}}; 
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "DD-API-KEY": `${apiKey}`,
        "DD-APPLICATION-KEY": `${applicationKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(DatadogBody)
    });
    if (!response.ok) {
      const errorBody = await response.text();
      if (response.status === 401) {
        throw new MCPError(
          "Invalid Datadog API or Application key."
        );
      } else if (response.status === 403) {
        throw new MCPError(
          "Insufficient permissions."
        );
      } else if (response.status === 429) {
        throw new MCPError(
          "Datadog API rate limit exceeded. Please try again later."
        );
      }
      throw new MCPError(`Datadog API error (${response.status}): ${errorBody}`);
    }

    return response.json();
  };

  server.tool(
    "eval_prompt",
    "Calls Prompt Guard service to evaluate the user message for a jailbreak attack",
    {
      message: z.string().describe("The user message"),
      endpoint: z.string().optional().describe("Optional API endpoint"),
    },
    withToolLogging(
      auth,
      { toolName: "prompt_guard", agentLoopContext },
      async ({ message, endpoint }) => {
        const toolConfig = agentLoopContext?.runContext?.toolConfiguration;
                // if (
        //   !toolConfig ||
        //   !isLightServerSideMCPToolConfiguration(toolConfig) ||
        //   !toolConfig.secretName
        // ) {
        //   return new Err(
        //     new MCPError(
        //       "Lakera API key not configured. Please configure a secret containing an API key in the agent settings."
        //     )
        //   );
        // }

        // const secret = await DustAppSecret.findOne({
        //   where: {
        //     name: toolConfig.secretName,
        //     workspaceId: auth.getNonNullableWorkspace().id,
        //   },
        // });

        // const adminApiKey = secret
        //   ? decrypt(secret.hash, auth.getNonNullableWorkspace().sId)
        //   : null;
        // if (!adminApiKey) {
        //   return new Err(
        //     new MCPError(
        //       "Lakera API key not found in workspace secrets. Please check the secret configuration."
        //     )
        //   );
        // }
        
        try {
         //const data = makeLakeraRequest("guard/results", message,  "bc78e00bf1bbb5ff215d58a068745709bcfbb43d675f4139760cebf3a0945eee")  
         const data = await datadogAIGuardSDK(message, "d2988a993243d45a2e8d96c54ebb6d54", "7e8e749bf5b287ad2f1b73adb79a4267d48fc879");
    
         //const data = await makeLakeraRequest("guard", message,  "bc78e00bf1bbb5ff215d58a068745709bcfbb43d675f4139760cebf3a0945eee")
          return new Ok([
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ]);
        } catch (error) {
          if (error instanceof MCPError) {
            return new Err(error);
          }
          return new Err(
            new MCPError(
              `Failed to assess prompt: ${error instanceof Error ? error.message : "Unknown error"}`
            )
          );
        }
      }
    )
  );

  return server;
};

export default createServer;
