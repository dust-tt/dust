import { DustAPI, isSupportedFileContentType } from "@dust-tt/client"
import type {
  ConversationPublicType,
  LoggerInterface,
  SupportedFileContentType,
} from "@dust-tt/client"
import { readFile } from "fs/promises"
import { basename, extname } from "path"
import type { Result, AgentResponse } from "./types"
import { Ok, Err } from "./types"

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ".csv": "text/csv",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".gif": "image/gif",
  ".html": "text/html",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".txt": "text/plain",
  ".webp": "image/webp",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xml": "application/xml",
  ".yaml": "application/x-yaml",
  ".yml": "application/x-yaml",
}

function guessContentType(fileName: string): SupportedFileContentType {
  const guess = CONTENT_TYPE_BY_EXTENSION[extname(fileName).toLowerCase()]
  if (guess && isSupportedFileContentType(guess)) {
    return guess
  }
  return "application/octet-stream"
}

const AGENT_MESSAGE_POLL_ATTEMPTS = 8
const AGENT_MESSAGE_POLL_INITIAL_DELAY_MS = 250
const AGENT_MESSAGE_POLL_MAX_DELAY_MS = 2000

const DUST_API_BASE_URL = "https://dust.tt"

// `costCredits` is computed in a post-success finalize step on the server, so it
// is frequently still null in the first fetch right after the stream completes.
// Poll a few times to give it a chance to be persisted.
const COST_POLL_ATTEMPTS = 6
const COST_POLL_INITIAL_DELAY_MS = 500
const COST_POLL_MAX_DELAY_MS = 3000

function hasAgentMessageFor(
  conversation: ConversationPublicType,
  userMessageId: string
): boolean {
  return conversation.content.some((versions) => {
    const m = versions[versions.length - 1]
    return (
      m != null &&
      m.type === "agent_message" &&
      m.parentMessageId === userMessageId
    )
  })
}

async function pollForAgentMessage(
  client: DustAPI,
  conversationId: string,
  userMessageId: string
): Promise<Result<ConversationPublicType>> {
  let delayMs = AGENT_MESSAGE_POLL_INITIAL_DELAY_MS
  for (let attempt = 1; attempt <= AGENT_MESSAGE_POLL_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, delayMs))
    const res = await client.getConversation({ conversationId })
    if (!res.isOk()) {
      return Err(
        new Error(
          `Failed to poll conversation ${conversationId}: ${JSON.stringify(res.error)}`
        )
      )
    }
    if (hasAgentMessageFor(res.value, userMessageId)) {
      return Ok(res.value)
    }
    delayMs = Math.min(delayMs * 2, AGENT_MESSAGE_POLL_MAX_DELAY_MS)
  }
  return Err(
    new Error(
      `Agent message not present after ${AGENT_MESSAGE_POLL_ATTEMPTS} polls for conversation ${conversationId}`
    )
  )
}

/**
 * The public conversation endpoint serializes `costCredits` and
 * `subAgentCostCredits` on agent messages, but the SDK's zod schema strips
 * them. We read them from the raw JSON instead.
 *
 * `costCredits` is the agent message's own cost (its intelligence + tools).
 * `subAgentCostCredits` is the recursively-aggregated cost of every sub-agent
 * (`run_agent`) the message spawned. The server only computes the latter when
 * rendering a single agent message, which is always the case here since each
 * eval prompt runs in its own fresh conversation (one agent message).
 */
interface RawAgentMessage {
  type: "agent_message"
  parentMessageId: string | null
  costCredits?: number | null
  subAgentCostCredits?: number | null
}

/**
 * The agent's own cost plus the cost of any sub-agents it spawned. `null`
 * fields mean "not (yet) available"; `subAgentCostCredits` is `0` when the
 * agent spawned no sub-agents.
 */
export interface AgentCostBreakdown {
  costCredits: number | null
  subAgentCostCredits: number | null
}

function isRawAgentMessageForUserMessage(
  message: unknown,
  userMessageId: string
): message is RawAgentMessage {
  if (typeof message !== "object" || message === null) {
    return false
  }
  const m = message as Record<string, unknown>
  return m["type"] === "agent_message" && m["parentMessageId"] === userMessageId
}

/**
 * Extract the cost breakdown (in Dust credits) of the agent message replying to
 * `userMessageId` from a raw conversation payload: the message's own
 * `costCredits` and the aggregated `subAgentCostCredits` of any sub-agents it
 * spawned. Returns `null` fields when the agent message or its own cost is not
 * (yet) present.
 */
function extractCostCredits(
  rawConversation: unknown,
  userMessageId: string
): AgentCostBreakdown {
  const unavailable: AgentCostBreakdown = {
    costCredits: null,
    subAgentCostCredits: null,
  }

  if (typeof rawConversation !== "object" || rawConversation === null) {
    return unavailable
  }
  const content = (rawConversation as Record<string, unknown>)["content"]
  if (!Array.isArray(content)) {
    return unavailable
  }

  for (const versions of content) {
    if (!Array.isArray(versions) || versions.length === 0) {
      continue
    }
    const latest = versions[versions.length - 1]
    if (
      isRawAgentMessageForUserMessage(latest, userMessageId) &&
      typeof latest.costCredits === "number"
    ) {
      return {
        costCredits: latest.costCredits,
        subAgentCostCredits:
          typeof latest.subAgentCostCredits === "number"
            ? latest.subAgentCostCredits
            : null,
      }
    }
  }

  return unavailable
}

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
        // The published @dust-tt/client 1.2.6 build of streamAgentAnswerEvents
        // tries to JSON.parse the terminal `data: done` SSE line and logs this
        // (caught, non-fatal) error. The repo's SDK source already guards
        // against it; the npm artifact predates that fix. Swallow the noise so
        // real errors stay visible.
        if (message === "Failed parsing chunk from Dust API") {
          return
        }
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

  /**
   * Upload each file and return content fragments referencing them, ready to be
   * attached to a conversation. Returns an Err if any file cannot be read or
   * uploaded so the caller can fail the run rather than evaluate without the
   * intended context.
   */
  private async uploadFilesAsContentFragments(
    filePaths: string[]
  ): Promise<Result<Array<{ fileId: string; title: string }>>> {
    const fragments: Array<{ fileId: string; title: string }> = []

    for (const filePath of filePaths) {
      const fileName = basename(filePath)

      let buffer: Buffer
      try {
        buffer = await readFile(filePath)
      } catch (error) {
        return Err(
          new Error(
            `Failed to read attachment '${filePath}': ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        )
      }

      const contentType = guessContentType(fileName)
      const fileObject = new File([buffer], fileName, { type: contentType })

      const uploadRes = await this.client.uploadFile({
        contentType,
        fileName,
        fileSize: fileObject.size,
        useCase: "conversation",
        fileObject,
      })

      if (uploadRes.isErr()) {
        return Err(
          new Error(
            `Failed to upload attachment '${fileName}': ${JSON.stringify(
              uploadRes.error
            )}`
          )
        )
      }

      fragments.push({ fileId: uploadRes.value.sId, title: fileName })
    }

    return Ok(fragments)
  }

  private async callAgentInternal(
    agentId: string,
    prompt: string,
    timeout: number,
    filePaths: string[]
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
      // Upload any attached files first so they can be referenced as content
      // fragments on the conversation.
      let contentFragments: Array<{ fileId: string; title: string }> = []
      if (filePaths.length > 0) {
        const uploaded = await this.uploadFilesAsContentFragments(filePaths)
        if (!uploaded.isOk) {
          return Err(uploaded.error)
        }
        contentFragments = uploaded.value
      }

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
        ...(contentFragments.length > 0 ? { contentFragments } : {}),
      })

      if (!conversationRes.isOk()) {
        return Err(
          new Error(
            `Failed to create conversation: ${JSON.stringify(conversationRes.error)}`
          )
        )
      }

      let conversation = conversationRes.value.conversation
      const userMessageId = conversationRes.value.message?.sId

      if (!userMessageId) {
        return Err(new Error("No message created in conversation"))
      }

      const conversationId = conversation.sId

      // Under load the createConversation response sometimes lands before the
      // agent_message has been persisted to conversation.content. The SDK then
      // fails with "Failed to retrieve agent message". Poll briefly to recover.
      if (!hasAgentMessageFor(conversation, userMessageId)) {
        const polled = await pollForAgentMessage(
          this.client,
          conversationId,
          userMessageId
        )
        if (!polled.isOk) {
          return Err(polled.error)
        }
        conversation = polled.value
      }

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
              // Only the user-facing answer ("tokens") is handed to the judge.
              // "chain_of_thought" is the agent's internal reasoning and the
              // delimiter classifications are stream framing — including either
              // would leak internal reasoning into what the judge evaluates.
              if (event.text && event.classification === "tokens") {
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

  /**
   * Fetch the total cost (in Dust credits) of the agent message replying to
   * `userMessageId`: its own cost plus the aggregated cost of every sub-agent
   * it spawned. The cost is computed in a post-success step on the server, so
   * we poll briefly until it is persisted. By the time the agent's own
   * `costCredits` appears, the run (including its sub-agents) has finalized, so
   * `subAgentCostCredits` is already populated (and `0` when there were none).
   * Returns null if it never appears (e.g. free usage, server error) so callers
   * can degrade gracefully.
   */
  private async fetchCostCredits(
    conversationId: string,
    userMessageId: string
  ): Promise<number | null> {
    const url = `${DUST_API_BASE_URL}/api/v1/w/${this.config.workspaceId}/assistant/conversations/${conversationId}`

    let delayMs = COST_POLL_INITIAL_DELAY_MS
    for (let attempt = 1; attempt <= COST_POLL_ATTEMPTS; attempt++) {
      await new Promise((r) => setTimeout(r, delayMs))

      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
        })

        if (res.ok) {
          const body = (await res.json()) as { conversation?: unknown }
          const { costCredits, subAgentCostCredits } = extractCostCredits(
            body.conversation,
            userMessageId
          )
          if (costCredits !== null) {
            const totalCostCredits = costCredits + (subAgentCostCredits ?? 0)
            if (this.config.verbose && subAgentCostCredits) {
              console.error(
                `    [Cost ${conversationId}] own=${costCredits} + subAgents=${subAgentCostCredits} = ${totalCostCredits} credits`
              )
            }
            return totalCostCredits
          }
        } else if (this.config.verbose) {
          console.error(
            `    [Cost ${conversationId}] Fetch returned ${res.status}`
          )
        }
      } catch (error) {
        if (this.config.verbose) {
          console.error(
            `    [Cost ${conversationId}] Fetch failed: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }

      delayMs = Math.min(delayMs * 2, COST_POLL_MAX_DELAY_MS)
    }

    if (this.config.verbose) {
      console.error(
        `    [Cost ${conversationId}] costCredits not available after ${COST_POLL_ATTEMPTS} polls`
      )
    }
    return null
  }

  async callAgent(
    agentId: string,
    prompt: string,
    timeout: number,
    // Judges are agents too, but we only track the cost of the agent under
    // evaluation. Skip the (polling) cost fetch when calling judges to avoid the
    // extra latency and API calls.
    fetchCost: boolean = true,
    // Absolute paths to files attached to the prompt as content fragments.
    filePaths: string[] = []
  ): Promise<Result<AgentResponse>> {
    const { maxRetries, retryBackoffMs } = this.config
    let lastError: Error | null = null
    let retryCount = 0

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (this.config.verbose) {
        console.error(`    [Agent ${agentId}] Attempt ${attempt}/${maxRetries}`)
      }

      const result = await this.callAgentInternal(
        agentId,
        prompt,
        timeout,
        filePaths
      )

      if (result.isOk) {
        const costCredits = fetchCost
          ? await this.fetchCostCredits(
              result.value.conversationId,
              result.value.messageId
            )
          : null
        return Ok({
          agentId,
          prompt,
          response: result.value.response,
          timestamp: Date.now(),
          durationMs: result.value.durationMs,
          conversationId: result.value.conversationId,
          messageId: result.value.messageId,
          retryCount,
          costCredits,
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
      costCredits: null,
      error: lastError?.message ?? "All retry attempts failed",
      wasTimeout,
    })
  }

  async callJudge(
    judgeId: string,
    prompt: string,
    timeout: number,
    // Absolute paths to the same files attached to the agent's prompt, so the
    // judge can evaluate responses that depend on the attached content.
    filePaths: string[] = []
  ): Promise<
    Result<{ response: string; conversationId: string; durationMs: number }>
  > {
    const result = await this.callAgent(
      judgeId,
      prompt,
      timeout,
      false,
      filePaths
    )

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
      // API keys authenticate without an OAuth user, so the "list" view is
      // rejected (401). "all" returns every non-private agent and is the
      // intended default for API-key auth.
      const result = await this.client.getAgentConfigurations({ view: "all" })

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
