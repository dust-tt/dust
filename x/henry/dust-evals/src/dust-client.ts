import { DustAPI } from "@dust-tt/client"
import type { LoggerInterface } from "@dust-tt/client"
import type { Result, AgentResponse } from "./types"
import { Ok, Err } from "./types"

// Simple logger implementation.
const logger: LoggerInterface = {
  error: (_args: Record<string, unknown>, _message: string) => {
    // Silent by default.
  },
  info: (_args: Record<string, unknown>, _message: string) => {
    // Silent by default.
  },
  trace: (_args: Record<string, unknown>, _message: string) => {
    // Silent by default.
  },
  warn: (_args: Record<string, unknown>, _message: string) => {
    // Silent by default.
  },
}

export class DustClient {
  private client: DustAPI

  constructor(apiKey: string, workspaceId: string) {
    this.client = new DustAPI(
      { url: "https://dust.tt" },
      {
        apiKey,
        workspaceId,
      },
      logger
    )
  }

  async callAgent(
    agentId: string,
    prompt: string,
    timeout: number
  ): Promise<Result<AgentResponse>> {
    const startTime = Date.now()

    try {
      console.error(`    Calling agent: ${agentId}`)
      // Create a new conversation with the message included.
      const conversationRes = await this.client.createConversation({
        title: prompt.substring(0, 50) + (prompt.length > 50 ? "..." : ""),
        visibility: "unlisted",
        message: {
          content: prompt,
          mentions: [
            {
              configurationId: agentId,
            },
          ],
          context: {
            username: "eval-system",
            timezone: "UTC",
            origin: "api" as const,
          },
        },
      })

      if (!conversationRes.isOk()) {
        console.error(`    Failed to create conversation:`, conversationRes.error)
        return Err(
          new Error(
            `Failed to create conversation: ${JSON.stringify(conversationRes.error)}`
          )
        )
      }

      const conversation = conversationRes.value.conversation
      const userMessageId = conversationRes.value.message?.sId

      if (!userMessageId) {
        return Err(new Error("No message created in conversation"))
      }

      // Stream the agent response.
      let fullResponse = ""
      // Use global AbortController for browser/node compatibility.
      const controller: any = new (globalThis.AbortController as any)()
      const signal: any = controller.signal
      const timeoutId = setTimeout(() => {
        controller.abort()
      }, timeout)

      try {
        const streamRes = await this.client.streamAgentAnswerEvents({
          conversation,
          userMessageId,
          signal,
        })

        if (!streamRes.isOk()) {
          console.error(`    Failed to stream response:`, streamRes.error)
          const errorMessage = streamRes.error
            ? typeof streamRes.error === "object"
              ? "message" in streamRes.error
                ? String(streamRes.error.message)
                : JSON.stringify(streamRes.error)
              : String(streamRes.error)
            : "Unknown streaming error"
          return Err(new Error(`Failed to stream response: ${errorMessage}`))
        }

        const stream = streamRes.value.eventStream

        for await (const event of stream) {
          // Check if we should abort.
          if (signal.aborted) {
            clearTimeout(timeoutId)
            return Err(new Error(`Agent call timed out after ${timeout}ms`))
          }

          switch (event.type) {
            case "generation_tokens":
              if ("text" in event && event.text) {
                fullResponse += event.text
              }
              break
            case "agent_error":
              clearTimeout(timeoutId)
              return Err(
                new Error(
                  `Agent error: ${event.error.message || "Unknown error"}`
                )
              )
            case "agent_message_success":
              clearTimeout(timeoutId)
              return Ok({
                agentId,
                prompt,
                response: fullResponse.trim(),
                timestamp: Date.now(),
                durationMs: Date.now() - startTime,
              })
          }
        }

        clearTimeout(timeoutId)

        if (!fullResponse) {
          return Err(new Error("No response received from agent"))
        }

        return Ok({
          agentId,
          prompt,
          response: fullResponse.trim(),
          timestamp: Date.now(),
          durationMs: Date.now() - startTime,
        })
      } catch (error) {
        clearTimeout(timeoutId)
        if (signal.aborted) {
          return Err(new Error(`Agent call timed out after ${timeout}ms`))
        }
        throw error
      }
    } catch (error) {
      return Err(
        error instanceof Error
          ? error
          : new Error(`Unknown error: ${String(error)}`)
      )
    }
  }

  async callJudge(
    judgeId: string,
    prompt: string,
    timeout: number
  ): Promise<Result<string>> {
    const result = await this.callAgent(judgeId, prompt, timeout)

    if (!result.isOk) {
      return result
    }

    return Ok(result.value.response)
  }
}
