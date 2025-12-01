import { DustAPI } from "@dust-tt/client"
import type { LoggerInterface } from "@dust-tt/client"
import type { Result, AgentResponse } from "./types"
import { Ok, Err } from "./types"

export interface DustClientConfig {
  apiKey: string
  workspaceId: string
  verbose: boolean
  maxRetries: number
  retryBackoffMs: number
}

/**
 * Check if an error is retryable.
 * - 4xx errors (except 429 rate limit) should not be retried
 * - 5xx errors, network errors, and timeouts should be retried
 */
function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase()

  // Rate limit errors should be retried
  if (message.includes("429") || message.includes("rate limit")) {
    return true
  }

  // 4xx client errors should not be retried (except 429)
  if (message.includes("400") || message.includes("bad request")) return false
  if (message.includes("401") || message.includes("unauthorized")) return false
  if (message.includes("403") || message.includes("forbidden")) return false
  if (message.includes("404") || message.includes("not found")) return false

  // Timeouts should be retried
  if (message.includes("timeout")) return true

  // Network errors should be retried
  if (message.includes("network") || message.includes("econnreset")) return true
  if (message.includes("econnrefused") || message.includes("etimedout"))
    return true

  // 5xx server errors should be retried
  if (message.includes("500") || message.includes("internal server"))
    return true
  if (message.includes("502") || message.includes("bad gateway")) return true
  if (message.includes("503") || message.includes("service unavailable"))
    return true
  if (message.includes("504") || message.includes("gateway timeout"))
    return true

  // Default to retrying unknown errors
  return true
}

/**
 * Create a logger based on verbose setting.
 */
function createLogger(verbose: boolean): LoggerInterface {
  if (verbose) {
    return {
      error: (args: Record<string, unknown>, message: string): void => {
        console.error(`[DUST ERROR] ${message}`, args)
      },
      info: (args: Record<string, unknown>, message: string): void => {
        console.error(`[DUST INFO] ${message}`, args)
      },
      trace: (args: Record<string, unknown>, message: string): void => {
        console.error(`[DUST TRACE] ${message}`, args)
      },
      warn: (args: Record<string, unknown>, message: string): void => {
        console.error(`[DUST WARN] ${message}`, args)
      },
    }
  }

  return {
    error: (): void => {},
    info: (): void => {},
    trace: (): void => {},
    warn: (): void => {},
  }
}

export class DustClient {
  private client: DustAPI
  private config: DustClientConfig

  constructor(config: DustClientConfig) {
    this.config = config
    this.client = new DustAPI(
      { url: "https://dust.tt" },
      {
        apiKey: config.apiKey,
        workspaceId: config.workspaceId,
      },
      createLogger(config.verbose)
    )
  }

  private async callAgentInternal(
    agentId: string,
    prompt: string,
    timeout: number
  ): Promise<
    Result<{
      response: string
      conversationId: string
      messageId: string
      durationMs: number
    }>
  > {
    const startTime = Date.now()

    try {
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

      const conversationId = conversation.sId

      // Stream the agent response.
      let fullResponse = ""
      const controller = new AbortController()
      const signal = controller.signal
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
          if (signal.aborted) {
            clearTimeout(timeoutId)
            return Err(new Error(`Timeout after ${timeout}ms`))
          }

          switch (event.type) {
            case "generation_tokens":
              if ("text" in event && event.text) {
                const classification = (event as any).classification
                if (classification !== "thinking") {
                  fullResponse += event.text
                }
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
                response: fullResponse.trim(),
                conversationId,
                messageId: userMessageId,
                durationMs: Date.now() - startTime,
              })
          }
        }

        clearTimeout(timeoutId)

        if (!fullResponse) {
          return Err(new Error("No response received from agent"))
        }

        return Ok({
          response: fullResponse.trim(),
          conversationId,
          messageId: userMessageId,
          durationMs: Date.now() - startTime,
        })
      } catch (error) {
        clearTimeout(timeoutId)
        if (signal.aborted) {
          return Err(new Error(`Timeout after ${timeout}ms`))
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

  async callAgent(
    agentId: string,
    prompt: string,
    timeout: number
  ): Promise<Result<AgentResponse>> {
    const { maxRetries, retryBackoffMs } = this.config
    let lastError: Error | null = null
    let retryCount = 0

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (this.config.verbose) {
        console.error(`    [Agent ${agentId}] Attempt ${attempt}/${maxRetries}`)
      }

      const result = await this.callAgentInternal(agentId, prompt, timeout)

      if (result.isOk) {
        return Ok({
          agentId,
          prompt,
          response: result.value.response,
          timestamp: Date.now(),
          durationMs: result.value.durationMs,
          conversationId: result.value.conversationId,
          messageId: result.value.messageId,
          retryCount,
        })
      }

      lastError = result.error

      // Check if error is retryable
      if (!isRetryableError(result.error)) {
        if (this.config.verbose) {
          console.error(
            `    [Agent ${agentId}] Non-retryable error: ${result.error.message}`
          )
        }
        return Err(result.error)
      }

      if (this.config.verbose || attempt > 1) {
        console.error(
          `    [Agent ${agentId}] Attempt ${attempt} failed: ${result.error.message}`
        )
      }

      // Don't wait after the last attempt
      if (attempt < maxRetries) {
        retryCount++
        // Exponential backoff with jitter
        const baseDelay = retryBackoffMs * Math.pow(2, attempt - 1)
        const jitter = Math.random() * 0.3 * baseDelay // 0-30% jitter
        const delay = Math.round(baseDelay + jitter)

        if (this.config.verbose) {
          console.error(`    [Agent ${agentId}] Retrying in ${delay}ms...`)
        }
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    // All retries failed
    const wasTimeout = lastError?.message.includes("Timeout") ?? false
    return Ok({
      agentId,
      prompt,
      response: "",
      timestamp: Date.now(),
      durationMs: 0,
      conversationId: "",
      messageId: "",
      retryCount,
      error: lastError?.message ?? "All retry attempts failed",
      wasTimeout,
    })
  }

  async callJudge(
    judgeId: string,
    prompt: string,
    timeout: number
  ): Promise<
    Result<{ response: string; conversationId: string; durationMs: number }>
  > {
    const result = await this.callAgent(judgeId, prompt, timeout)

    if (!result.isOk) {
      return result
    }

    if (result.value.error) {
      return Err(new Error(result.value.error))
    }

    return Ok({
      response: result.value.response,
      conversationId: result.value.conversationId,
      durationMs: result.value.durationMs,
    })
  }

  /**
   * Validate that an agent exists and is accessible.
   */
  async validateAgent(agentId: string): Promise<Result<{ name: string }>> {
    try {
      const result = await this.client.getAgentConfigurations({ view: "list" })

      if (!result.isOk()) {
        return Err(
          new Error(
            `Failed to get agent configurations: ${JSON.stringify(result.error)}`
          )
        )
      }

      const agents = result.value
      const agent = agents.find((a: { sId: string }) => a.sId === agentId)

      if (!agent) {
        return Err(new Error(`Agent '${agentId}' not found in workspace`))
      }

      return Ok({ name: (agent as { name: string }).name })
    } catch (error) {
      return Err(
        error instanceof Error
          ? error
          : new Error(`Failed to validate agent: ${String(error)}`)
      )
    }
  }
}
