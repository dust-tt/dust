#!/usr/bin/env node
import {
  callDustAgentTool
} from "./chunk-QN4G4IVN.js";

// src/index.tsx
import React10 from "react";
import { render } from "ink";
import meow from "meow";

// src/ui/App.tsx
import { Box as Box9, Text as Text9 } from "ink";
import Spinner4 from "ink-spinner";
import React9, { useState as useState6, useCallback as useCallback4, useEffect as useEffect4 } from "react";

// src/utils/dustClient.ts
import { DustAPI, Err as Err3, Ok as Ok3 } from "@dust-tt/client";

// src/utils/authService.ts
import { Err as Err2, Ok as Ok2 } from "@dust-tt/client";
import { jwtDecode as jwtDecode2 } from "jwt-decode";
import fetch from "node-fetch";

// src/utils/errors.ts
function errorToString(error) {
  if (error instanceof Error) {
    return error.message;
  } else if (typeof error === "string") {
    return error;
  }
  return JSON.stringify(error);
}
function normalizeError(error) {
  if (error instanceof Error) {
    return error;
  }
  return new Error(errorToString(error));
}

// src/utils/tokenStorage.ts
import { Err, Ok } from "@dust-tt/client";
import { jwtDecode } from "jwt-decode";
import keytar from "keytar";
var SERVICE_NAME = "dust-cli";
var ACCESS_TOKEN_KEY = "access_token";
var REFRESH_TOKEN_KEY = "refresh_token";
var WORKSPACE_KEY = "workspace_sid";
var REGION_KEY = "region";
var TokenStorage = {
  async saveTokens(accessToken, refreshToken) {
    await keytar.setPassword(SERVICE_NAME, ACCESS_TOKEN_KEY, accessToken);
    await keytar.setPassword(SERVICE_NAME, REFRESH_TOKEN_KEY, refreshToken);
  },
  async getAccessToken() {
    return keytar.getPassword(SERVICE_NAME, ACCESS_TOKEN_KEY);
  },
  async getRefreshToken() {
    return keytar.getPassword(SERVICE_NAME, REFRESH_TOKEN_KEY);
  },
  async hasValidAccessToken() {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      return new Err(new Error("No access token found"));
    }
    if (accessToken.startsWith("sk-")) {
      return new Ok(true);
    }
    let decoded;
    try {
      decoded = jwtDecode(accessToken);
    } catch (error) {
      return new Err(normalizeError(error));
    }
    const currentTimeSeconds = Math.floor(Date.now() / 1e3);
    return new Ok(decoded.exp > currentTimeSeconds);
  },
  async saveWorkspaceId(workspaceSid) {
    await keytar.setPassword(SERVICE_NAME, WORKSPACE_KEY, workspaceSid);
  },
  async getWorkspaceId() {
    return keytar.getPassword(SERVICE_NAME, WORKSPACE_KEY);
  },
  async saveRegion(region) {
    await keytar.setPassword(SERVICE_NAME, REGION_KEY, region);
  },
  async getRegion() {
    return keytar.getPassword(SERVICE_NAME, REGION_KEY);
  },
  async clearTokens() {
    await keytar.deletePassword(SERVICE_NAME, ACCESS_TOKEN_KEY);
    await keytar.deletePassword(SERVICE_NAME, REFRESH_TOKEN_KEY);
    await keytar.deletePassword(SERVICE_NAME, WORKSPACE_KEY);
    await keytar.deletePassword(SERVICE_NAME, REGION_KEY);
  }
};
var tokenStorage_default = TokenStorage;

// src/utils/authService.ts
var AuthService = {
  async refreshTokens() {
    const refreshToken = await tokenStorage_default.getRefreshToken();
    if (!refreshToken) {
      return new Err2(new Error("No refresh token found"));
    }
    const workOSDomain = "api.workos.com";
    const clientId = "client_01JGCT55EJ328PJ8MSCVSKVDKE";
    const response = await fetch(
      `https://${workOSDomain}/user_management/authenticate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          refresh_token: refreshToken
        })
      }
    );
    if (!response.ok) {
      if (response.status === 400 || response.status === 401) {
        await tokenStorage_default.clearTokens();
        resetDustClient();
      }
      return new Err2(new Error("Failed to refresh tokens"));
    }
    const data = await response.json();
    await tokenStorage_default.saveTokens(data.access_token, data.refresh_token);
    resetDustClient();
    return new Ok2(true);
  },
  async getValidAccessToken() {
    const accessToken = await tokenStorage_default.getAccessToken();
    if (accessToken == null ? void 0 : accessToken.startsWith("sk-")) {
      return new Ok2(accessToken);
    }
    const isValid = await tokenStorage_default.hasValidAccessToken();
    if (isValid.isErr()) {
      return isValid;
    }
    if (!isValid.value || !accessToken) {
      const refreshed = await this.refreshTokens();
      if (refreshed.isErr()) {
        return new Err2(new Error("Failed to refresh tokens"));
      }
      return new Ok2(await tokenStorage_default.getAccessToken());
    }
    let decoded;
    try {
      decoded = jwtDecode2(accessToken);
    } catch (error) {
      const refreshed = await this.refreshTokens();
      if (refreshed.isOk()) {
        return new Ok2(await tokenStorage_default.getAccessToken());
      }
      return new Err2(normalizeError(error));
    }
    const currentTimeSeconds = Math.floor(Date.now() / 1e3);
    const timeUntilExpirySeconds = (decoded.exp ?? 0) - currentTimeSeconds;
    if (timeUntilExpirySeconds < 30) {
      const refreshed = await this.refreshTokens();
      if (refreshed.isOk()) {
        return new Ok2(await tokenStorage_default.getAccessToken());
      }
      return refreshed;
    }
    return new Ok2(accessToken);
  },
  async isAuthenticated() {
    const hasValidAccessToken = await tokenStorage_default.hasValidAccessToken();
    if (hasValidAccessToken.isErr()) {
      return false;
    }
    if (hasValidAccessToken.value) {
      return true;
    }
    const refreshed = await this.refreshTokens();
    if (refreshed.isOk()) {
      return true;
    }
    return false;
  },
  async logout() {
    await tokenStorage_default.clearTokens();
    resetDustClient();
  },
  async getSelectedWorkspaceId() {
    return tokenStorage_default.getWorkspaceId();
  },
  async getFreshAccessToken() {
    const accessToken = await tokenStorage_default.getAccessToken();
    if (accessToken == null ? void 0 : accessToken.startsWith("sk-")) {
      return accessToken;
    }
    const refreshed = await this.refreshTokens();
    if (!refreshed) {
      return null;
    }
    return tokenStorage_default.getAccessToken();
  }
};
var authService_default = AuthService;

// src/utils/dustClient.ts
var dustApiInstance = null;
var getApiDomain = (region) => {
  const url = (() => {
    switch (region) {
      case "europe-west1":
        return "http://localhost:3000";
      case "us-central1":
        return "http://localhost:3000";
      default:
        return "http://localhost:3000";
    }
  })();
  if (!url) {
    return new Err3(new Error("Unable to determine API domain."));
  }
  return new Ok3(url);
};
var getDustClient = async () => {
  if (dustApiInstance) {
    return new Ok3(dustApiInstance);
  }
  const accessToken = await authService_default.getValidAccessToken();
  if (!accessToken) {
    return new Ok3(null);
  }
  const region = await tokenStorage_default.getRegion();
  const apiDomainRes = getApiDomain(region);
  if (apiDomainRes.isErr()) {
    return new Err3(apiDomainRes.error);
  }
  dustApiInstance = new DustAPI(
    {
      url: apiDomainRes.value
    },
    {
      apiKey: async () => {
        const token = await authService_default.getValidAccessToken();
        if (token.isErr()) {
          return null;
        }
        return token.value || "";
      },
      workspaceId: await tokenStorage_default.getWorkspaceId() ?? "me",
      extraHeaders: {
        "X-Dust-CLI-Version": process.env.npm_package_version || "0.1.0",
        "User-Agent": "Dust Coding CLI"
      }
    },
    console
  );
  return new Ok3(dustApiInstance);
};
var resetDustClient = () => {
  dustApiInstance = null;
};

// src/ui/Auth.tsx
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { jwtDecode as jwtDecode3 } from "jwt-decode";
import fetch2 from "node-fetch";
import open from "open";
import React, { useCallback, useEffect, useState } from "react";
function Auth({ onComplete, apiKey, wId }) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deviceCode, setDeviceCode] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const effectiveApiKey = apiKey || process.env.DUST_API_KEY;
  const effectiveWId = wId || process.env.DUST_WORKSPACE_ID;
  const workOSDomain = "api.workos.com";
  const clientId = "client_01JGCT55EJ328PJ8MSCVSKVDKE";
  const startPolling = useCallback(
    (deviceCodeData) => {
      setIsPolling(true);
      const pollIntervalSeconds = deviceCodeData.interval;
      const expiresInSeconds = deviceCodeData.expires_in;
      const maxAttempts = Math.floor(expiresInSeconds / pollIntervalSeconds);
      let attempts = 0;
      const pollForToken = async () => {
        if (attempts >= maxAttempts) {
          setIsPolling(false);
          setError("Authentication timed out. Please try again.");
          return;
        }
        try {
          const response = await fetch2(
            `https://${workOSDomain}/user_management/authenticate`,
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                device_code: deviceCodeData.device_code,
                client_id: clientId
              })
            }
          );
          const data = await response.json();
          if ("error" in data) {
            if (data.error === "authorization_pending") {
              attempts++;
              setTimeout(pollForToken, pollIntervalSeconds * 1e3);
            } else if (data.error === "slow_down") {
              attempts++;
              setTimeout(pollForToken, (pollIntervalSeconds + 5) * 1e3);
            } else {
              setIsPolling(false);
              setError(`Authentication error: ${data.error_description || data.error}`);
            }
          } else {
            await tokenStorage_default.saveTokens(data.access_token, data.refresh_token);
            try {
              const decodedToken = jwtDecode3(data.access_token);
              const claimNamespace = "https://dust.tt/";
              const regionClaimName = `${claimNamespace}region`;
              const region = decodedToken[regionClaimName];
              await tokenStorage_default.saveRegion(region ?? "us-central1");
            } catch {
              await tokenStorage_default.saveRegion("us-central1");
            }
            resetDustClient();
            setIsPolling(false);
            onComplete();
          }
        } catch (err) {
          setIsPolling(false);
          setError(normalizeError(err).message);
        }
      };
      setTimeout(pollForToken, pollIntervalSeconds * 1e3);
    },
    [clientId, workOSDomain, onComplete]
  );
  const startDeviceFlow = useCallback(async () => {
    const hasValidToken = await tokenStorage_default.hasValidAccessToken();
    if (hasValidToken.isOk() && hasValidToken.value) {
      setIsLoading(false);
      onComplete();
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch2(
        `https://${workOSDomain}/user_management/authorize/device`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: clientId, scope: "openid profile email" })
        }
      );
      if (!response.ok) {
        setError("Failed to start device authorization flow.");
        return;
      }
      const data = await response.json();
      setDeviceCode(data);
      setIsLoading(false);
      await open(data.verification_uri_complete);
      startPolling(data);
    } catch (err) {
      setError(normalizeError(err).message);
    }
  }, [clientId, workOSDomain, startPolling, onComplete]);
  const handleHeadlessAuth = useCallback(async () => {
    if (!effectiveApiKey || !effectiveWId) {
      return;
    }
    setIsLoading(true);
    try {
      await tokenStorage_default.saveTokens(effectiveApiKey, effectiveApiKey);
      await tokenStorage_default.saveWorkspaceId(effectiveWId);
      await tokenStorage_default.saveRegion("us-central1");
      resetDustClient();
      setIsLoading(false);
      onComplete();
    } catch (err) {
      setError(normalizeError(err).message);
      setIsLoading(false);
    }
  }, [effectiveApiKey, effectiveWId, onComplete]);
  useEffect(() => {
    if (effectiveApiKey && effectiveWId) {
      void handleHeadlessAuth();
    } else {
      void startDeviceFlow();
    }
  }, [effectiveApiKey, effectiveWId, handleHeadlessAuth, startDeviceFlow]);
  if (error) {
    return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column" }, /* @__PURE__ */ React.createElement(Text, { color: "red" }, "Error: ", error));
  }
  if (isLoading) {
    return /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Text, { color: "green" }, /* @__PURE__ */ React.createElement(Spinner, { type: "dots" })), /* @__PURE__ */ React.createElement(Text, null, " Initializing authentication..."));
  }
  if (isPolling && deviceCode) {
    return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column" }, /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Text, { color: "green" }, /* @__PURE__ */ React.createElement(Spinner, { type: "dots" })), /* @__PURE__ */ React.createElement(Text, null, " Waiting for you to authorize...")), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, null, "Please enter code: "), /* @__PURE__ */ React.createElement(Text, { color: "yellow", bold: true }, deviceCode.user_code)), /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Text, null, "at "), /* @__PURE__ */ React.createElement(Text, { color: "cyan", underline: true }, deviceCode.verification_uri)), /* @__PURE__ */ React.createElement(Text, null, "The page should have opened automatically in your browser."));
  }
  return /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Text, null, "Initializing..."));
}

// src/ui/Chat.tsx
import React7, { useState as useState4, useCallback as useCallback2, useEffect as useEffect2, useRef, useMemo } from "react";
import { Box as Box7, Text as Text7, Static } from "ink";
import Spinner2 from "ink-spinner";

// src/utils/streamCompletion.ts
async function streamCLICompletion(dustClient, params) {
  const res = await dustClient.request({
    method: "POST",
    path: "cli/completion",
    body: {
      conversation: { messages: params.messages },
      tools: params.tools,
      system: params.system,
      max_tokens: params.maxTokens,
      temperature: params.temperature
    },
    stream: true
  });
  if (res.isErr()) {
    return (async function* () {
      yield {
        type: "error",
        message: res.error.message
      };
    })();
  }
  const { response } = res.value;
  if (!response.ok || !response.body) {
    const text = typeof response.body === "string" ? response.body : "Stream not available";
    return (async function* () {
      yield {
        type: "error",
        message: `Error streaming completion: status=${response.status} ${text}`
      };
    })();
  }
  return parseSSEStream(response.body);
}
async function* parseSSEStream(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (; ; ) {
      const { value, done } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "done") {
              return;
            }
            try {
              const event = JSON.parse(data);
              yield event;
            } catch {
            }
          }
        }
      }
      if (done) {
        break;
      }
    }
    if (buffer.startsWith("data: ")) {
      const data = buffer.slice(6).trim();
      if (data && data !== "done") {
        try {
          const event = JSON.parse(data);
          yield event;
        } catch {
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// src/agent/loop.ts
function createAgentLoop(params) {
  const { dustClient, systemPrompt, tools, executeTool: executeTool2, maxTokens = 16384 } = params;
  const messages = [];
  let eventResolve = null;
  const eventQueue = [];
  let done = false;
  function emit(event) {
    if (eventResolve) {
      const resolve = eventResolve;
      eventResolve = null;
      resolve(event);
    } else {
      eventQueue.push(event);
    }
  }
  async function* events() {
    while (!done) {
      if (eventQueue.length > 0) {
        yield eventQueue.shift();
      } else {
        yield await new Promise((resolve) => {
          eventResolve = resolve;
        });
      }
    }
    while (eventQueue.length > 0) {
      yield eventQueue.shift();
    }
  }
  async function runCompletionLoop() {
    while (true) {
      let eventStream;
      try {
        eventStream = await streamCLICompletion(dustClient, {
          messages,
          tools,
          system: systemPrompt,
          maxTokens
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emit({ type: "error", message });
        return;
      }
      const toolCalls = [];
      let currentText = "";
      let stopReason = "end_turn";
      for await (const event of eventStream) {
        switch (event.type) {
          case "text_delta":
            currentText += event.text;
            emit({ type: "text_delta", text: event.text });
            break;
          case "thinking_delta":
            emit({ type: "thinking_delta", text: event.text });
            break;
          case "tool_use": {
            const toolEvent = event;
            toolCalls.push({
              id: toolEvent.id,
              name: toolEvent.name,
              input: toolEvent.input
            });
            emit({
              type: "tool_use",
              id: toolEvent.id,
              name: toolEvent.name,
              input: toolEvent.input
            });
            break;
          }
          case "usage":
            emit({
              type: "usage",
              inputTokens: event.input_tokens,
              outputTokens: event.output_tokens
            });
            break;
          case "done":
            stopReason = event.stop_reason;
            break;
          case "error":
            emit({
              type: "error",
              message: event.message,
              retryable: event.retryable
            });
            return;
        }
      }
      if (toolCalls.length > 0) {
        const functionCalls = toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: JSON.stringify(tc.input)
        }));
        const contents = [];
        if (currentText) {
          contents.push({ type: "text_content", value: currentText });
        }
        for (const fc of functionCalls) {
          contents.push({ type: "function_call", value: fc });
        }
        messages.push({ role: "assistant", function_calls: functionCalls, contents });
      } else if (currentText) {
        messages.push({
          role: "assistant",
          name: "assistant",
          contents: [{ type: "text_content", value: currentText }]
        });
      }
      if (toolCalls.length === 0) {
        emit({ type: "done", stopReason });
        return;
      }
      for (const toolCall of toolCalls) {
        emit({
          type: "tool_executing",
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input
        });
        const result = await executeTool2(toolCall);
        messages.push({
          role: "function",
          name: toolCall.name,
          function_call_id: toolCall.id,
          content: result
        });
        emit({
          type: "tool_result",
          id: toolCall.id,
          name: toolCall.name,
          result
        });
      }
    }
  }
  return {
    events,
    sendMessage(content) {
      messages.push({ role: "user", name: "user", content: [{ type: "text", text: content }] });
      runCompletionLoop();
    },
    stop() {
      done = true;
      emit({ type: "done", stopReason: "stopped" });
    },
    getMessages() {
      return messages;
    }
  };
}

// src/agent/systemPrompt.ts
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
function findProjectRoot(startDir) {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".git"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}
function loadDustMd(projectRoot) {
  if (!projectRoot) {
    return null;
  }
  const dustMdPath = path.join(projectRoot, "DUST.md");
  if (fs.existsSync(dustMdPath)) {
    return fs.readFileSync(dustMdPath, "utf-8");
  }
  return null;
}
function getGitStatus(cwd2) {
  try {
    const status = execSync("git status --short", { cwd: cwd2, encoding: "utf-8" });
    return status.trim() || "(clean)";
  } catch {
    return "(not a git repository)";
  }
}
function getGitBranch(cwd2) {
  try {
    return execSync("git branch --show-current", { cwd: cwd2, encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}
function buildSystemPrompt(cwd2) {
  const projectRoot = findProjectRoot(cwd2);
  const dustMd = loadDustMd(projectRoot);
  const gitStatus = getGitStatus(cwd2);
  const gitBranch = getGitBranch(cwd2);
  const date = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const platform = os.platform();
  let prompt = `You are a coding agent running in the Dust CLI. You help users with software engineering tasks by reading, writing, and editing code, running commands, and searching the codebase.

You have access to tools for file operations, command execution, and searching. Use them to assist the user.

# Environment
- Working directory: ${cwd2}
- Project root: ${projectRoot ?? cwd2}
- Platform: ${platform}
- Date: ${date}
- Git branch: ${gitBranch}
- Git status: ${gitStatus}

# Guidelines
- Read files before modifying them.
- Prefer editing existing files over creating new ones.
- Show diffs for file edits when the change is significant.
- Run tests after making code changes when appropriate.
- Keep responses concise and focused on the task.
- Use the glob and grep tools to search the codebase efficiently.
- For complex tasks, break them down into steps.
- You can call the call_dust_agent tool to delegate tasks to specialized Dust workspace agents.
- You can use the task tool to run sub-agents in parallel for independent work.

# Tool Usage
- Use read_file to read files before editing.
- Use edit_file for targeted text replacements (preferred over write_file for existing files).
- Use write_file only for creating new files or complete rewrites.
- Use bash for running commands, tests, and build tools.
- Use glob to find files by pattern.
- Use grep to search file contents.
- Use ask_user when you need clarification or approval.`;
  if (dustMd) {
    prompt += `

# Project Instructions (DUST.md)
${dustMd}`;
  }
  return prompt;
}

// src/tools/readFile.ts
import path3 from "path";

// src/utils/fileHandling.ts
import fs2 from "fs";
import { stat } from "fs/promises";
import path2 from "path";
var MAX_LINES_TEXT_FILE = 2e3;
var MAX_LINE_LENGTH_TEXT_FILE = 2e3;
var MAX_FILE_SIZE = 50 * 1024 * 1024;
function formatFileSize(bytes) {
  if (bytes === 0) {
    return "0 Bytes";
  }
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
function detectFileType(filePath) {
  const fileExtension = path2.extname(filePath).toLowerCase();
  if (fileExtension === ".ts" || fileExtension === ".tsx") {
    return "text";
  }
  const binaryExtensions = /* @__PURE__ */ new Set([
    ".zip",
    ".tar",
    ".gz",
    ".exe",
    ".dll",
    ".so",
    ".class",
    ".jar",
    ".war",
    ".7z",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".odt",
    ".ods",
    ".odp",
    ".bin",
    ".dat",
    ".obj",
    ".o",
    ".a",
    ".lib",
    ".wasm",
    ".pyc",
    ".pyo"
  ]);
  if (binaryExtensions.has(fileExtension)) {
    return "binary";
  }
  const imageExtensions = /* @__PURE__ */ new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".bmp"
  ]);
  if (imageExtensions.has(fileExtension)) {
    return "image";
  }
  if (fileExtension === ".pdf") {
    return "pdf";
  }
  return "text";
}
async function processFile(filePath, offset = 0, limit = MAX_LINES_TEXT_FILE) {
  if (!fs2.existsSync(filePath)) {
    return { error: `File at ${filePath} does not exist.` };
  }
  const stats = await stat(filePath);
  if (!stats.isFile()) {
    return { error: `Path is not a file: ${filePath}` };
  }
  if (stats.size > MAX_FILE_SIZE) {
    return { error: `File too large: ${formatFileSize(stats.size)}. Max: ${formatFileSize(MAX_FILE_SIZE)}` };
  }
  const fileType = detectFileType(filePath);
  switch (fileType) {
    case "binary":
      return { error: "Cannot handle binary files." };
    case "image":
    case "pdf": {
      const contentBuffer = await fs2.promises.readFile(filePath);
      const base64Data = contentBuffer.toString("base64");
      return { data: base64Data };
    }
    case "text": {
      const content = await fs2.promises.readFile(filePath, "utf-8");
      const lines = content.split("\n");
      const oldLineCount = lines.length;
      const startLine = Math.min(offset, oldLineCount);
      const endLine = Math.min(startLine + limit, oldLineCount);
      const selectedLines = lines.slice(startLine, endLine);
      const totalCut = endLine < oldLineCount;
      let linesCut = false;
      const formattedLines = selectedLines.map((line) => {
        if (line.length > MAX_LINE_LENGTH_TEXT_FILE) {
          linesCut = true;
          return line.substring(0, MAX_LINE_LENGTH_TEXT_FILE) + "... [cut]";
        }
        return line;
      });
      let cutMessage = "";
      if (totalCut) {
        cutMessage = `[File content cut: showing lines ${startLine + 1}-${endLine} of ${oldLineCount} total lines. Use offset/limit parameters to view more.]
`;
      } else if (linesCut) {
        cutMessage = `[File content partially cut: some lines exceeded maximum length of ${MAX_LINE_LENGTH_TEXT_FILE} characters.]
`;
      }
      const resContent = cutMessage + formattedLines.join("\n");
      return { data: resContent };
    }
    default:
      return { error: "Unsupported file type." };
  }
}

// src/tools/readFile.ts
function readFileTool(context) {
  return {
    name: "read_file",
    description: "Read a file from the filesystem. Returns the file content with line numbers. For large files, use offset and limit to read specific sections.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Absolute or relative path to the file to read."
        },
        offset: {
          type: "number",
          description: "Line number to start reading from (0-indexed). Default: 0."
        },
        limit: {
          type: "number",
          description: "Maximum number of lines to read. Default: 2000."
        }
      },
      required: ["file_path"]
    },
    async execute(input) {
      const filePath = path3.resolve(
        context.cwd,
        input.file_path
      );
      const offset = input.offset ?? 0;
      const limit = input.limit ?? 2e3;
      const result = await processFile(filePath, offset, limit);
      if ("error" in result) {
        return result.error;
      }
      return result.data;
    }
  };
}

// src/tools/writeFile.ts
import fs3 from "fs";
import path4 from "path";
function writeFileTool(context) {
  return {
    name: "write_file",
    description: "Write content to a file. Creates the file and parent directories if they don't exist. Overwrites the file if it already exists. Prefer edit_file for modifying existing files.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Absolute or relative path to write to."
        },
        content: {
          type: "string",
          description: "The content to write to the file."
        }
      },
      required: ["file_path", "content"]
    },
    async execute(input) {
      const filePath = path4.resolve(
        context.cwd,
        input.file_path
      );
      const content = input.content;
      const dir = path4.dirname(filePath);
      await fs3.promises.mkdir(dir, { recursive: true });
      await fs3.promises.writeFile(filePath, content, "utf-8");
      return `Successfully wrote ${content.length} characters to ${filePath}`;
    }
  };
}

// src/tools/editFile.ts
import fs4 from "fs";
import path5 from "path";
function editFileTool(context) {
  return {
    name: "edit_file",
    description: "Edit a file by replacing an exact string match with new content. The old_string must match exactly (including whitespace and indentation). Use read_file first to see the current content.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Absolute or relative path to the file to edit."
        },
        old_string: {
          type: "string",
          description: "The exact string to find and replace. Must be unique in the file."
        },
        new_string: {
          type: "string",
          description: "The replacement string."
        },
        replace_all: {
          type: "boolean",
          description: "If true, replace all occurrences. Default: false."
        }
      },
      required: ["file_path", "old_string", "new_string"]
    },
    async execute(input) {
      const filePath = path5.resolve(
        context.cwd,
        input.file_path
      );
      const oldString = input.old_string;
      const newString = input.new_string;
      const replaceAll = input.replace_all ?? false;
      if (!fs4.existsSync(filePath)) {
        return `Error: File does not exist: ${filePath}`;
      }
      const content = await fs4.promises.readFile(filePath, "utf-8");
      if (!content.includes(oldString)) {
        return `Error: old_string not found in file. Make sure the string matches exactly (including whitespace).`;
      }
      if (!replaceAll) {
        const firstIndex = content.indexOf(oldString);
        const secondIndex = content.indexOf(oldString, firstIndex + 1);
        if (secondIndex !== -1) {
          return `Error: old_string appears multiple times in the file. Provide more context to make it unique, or set replace_all to true.`;
        }
      }
      let newContent;
      if (replaceAll) {
        newContent = content.split(oldString).join(newString);
      } else {
        newContent = content.replace(oldString, newString);
      }
      await fs4.promises.writeFile(filePath, newContent, "utf-8");
      const linesChanged = newString.split("\n").length - oldString.split("\n").length;
      const changeDesc = linesChanged === 0 ? "modified" : linesChanged > 0 ? `added ${linesChanged} lines` : `removed ${Math.abs(linesChanged)} lines`;
      return `Successfully edited ${filePath}: ${changeDesc}`;
    }
  };
}

// src/tools/bash.ts
import { execa } from "execa";
var DEFAULT_TIMEOUT_MS = 12e4;
var MAX_OUTPUT_LENGTH = 3e4;
function bashTool(context) {
  return {
    name: "bash",
    description: "Execute a bash command. Returns stdout, stderr, and exit code. Commands run in the project working directory. Use for running tests, builds, git operations, and other system commands.",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The bash command to execute."
        },
        timeout_ms: {
          type: "number",
          description: `Timeout in milliseconds. Default: ${DEFAULT_TIMEOUT_MS}.`
        },
        cwd: {
          type: "string",
          description: "Working directory for the command. Default: project root."
        }
      },
      required: ["command"]
    },
    async execute(input) {
      const command = input.command;
      const timeoutMs = input.timeout_ms ?? DEFAULT_TIMEOUT_MS;
      const cwd2 = input.cwd ?? context.cwd;
      try {
        const result = await execa("bash", ["-c", command], {
          cwd: cwd2,
          timeout: timeoutMs,
          stdio: "pipe",
          buffer: true,
          env: {
            ...process.env,
            TERM: "dumb",
            NO_COLOR: "1"
          }
        });
        let output = "";
        if (result.stdout) {
          output += result.stdout;
        }
        if (result.stderr) {
          output += (output ? "\n\nSTDERR:\n" : "STDERR:\n") + result.stderr;
        }
        if (output.length > MAX_OUTPUT_LENGTH) {
          output = output.substring(0, MAX_OUTPUT_LENGTH) + "\n\n[output truncated]";
        }
        if (!output) {
          output = "(no output)";
        }
        return `Exit code: ${result.exitCode}
${output}`;
      } catch (err) {
        if (err && typeof err === "object" && "stdout" in err && "stderr" in err) {
          const execErr = err;
          if (execErr.timedOut) {
            return `Error: Command timed out after ${timeoutMs}ms`;
          }
          let output = "";
          if (execErr.stdout) {
            output += execErr.stdout;
          }
          if (execErr.stderr) {
            output += (output ? "\n\nSTDERR:\n" : "STDERR:\n") + execErr.stderr;
          }
          if (output.length > MAX_OUTPUT_LENGTH) {
            output = output.substring(0, MAX_OUTPUT_LENGTH) + "\n\n[output truncated]";
          }
          return `Exit code: ${execErr.exitCode ?? 1}
${output || "(no output)"}`;
        }
        const message = err instanceof Error ? err.message : String(err);
        return `Error executing command: ${message}`;
      }
    }
  };
}

// src/tools/glob.ts
import { glob as globFn } from "glob";
import path6 from "path";
import { stat as stat2 } from "fs/promises";
var DEFAULT_LIMIT = 100;
var DEFAULT_EXCLUDES = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/coverage/**"
];
function globTool(context) {
  return {
    name: "glob",
    description: 'Find files matching a glob pattern. Returns file paths sorted by modification time. Examples: "**/*.ts", "src/**/*.tsx", "package.json".',
    inputSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "The glob pattern to match files against."
        },
        directory: {
          type: "string",
          description: "Directory to search in. Default: project root."
        },
        limit: {
          type: "number",
          description: `Maximum number of results. Default: ${DEFAULT_LIMIT}.`
        }
      },
      required: ["pattern"]
    },
    async execute(input) {
      const pattern = input.pattern;
      const directory = input.directory ? path6.resolve(context.cwd, input.directory) : context.cwd;
      const limit = input.limit ?? DEFAULT_LIMIT;
      const files = await globFn(pattern, {
        cwd: directory,
        ignore: DEFAULT_EXCLUDES,
        nodir: true,
        absolute: false
      });
      if (files.length === 0) {
        return "No files found matching the pattern.";
      }
      const filesWithStats = await Promise.all(
        files.slice(0, limit * 2).map(async (f) => {
          const fullPath = path6.resolve(directory, f);
          try {
            const s = await stat2(fullPath);
            return { file: f, mtimeMs: s.mtimeMs };
          } catch {
            return { file: f, mtimeMs: 0 };
          }
        })
      );
      filesWithStats.sort((a, b) => b.mtimeMs - a.mtimeMs);
      const limited = filesWithStats.slice(0, limit);
      let result = limited.map((f) => f.file).join("\n");
      if (files.length > limit) {
        result += `

(${files.length - limit} more files not shown)`;
      }
      return result;
    }
  };
}

// src/tools/grep.ts
import path8 from "path";

// src/utils/grep.ts
import { Err as Err4, Ok as Ok4 } from "@dust-tt/client";
import { spawn } from "child_process";
import { EOL } from "os";
import path7 from "path";
async function performGrep(pattern, searchPath, filePattern) {
  const grepArgs = ["-r", "-n", "-H", "-E"];
  const commonExcludes = [".git", "node_modules", "bower_components"];
  for (const dir of commonExcludes) {
    grepArgs.push(`--exclude-dir=${dir}`);
  }
  if (filePattern) {
    grepArgs.push(`--include=${filePattern}`);
  }
  grepArgs.push(pattern);
  grepArgs.push(".");
  try {
    const output = await new Promise((resolve, reject) => {
      const child = spawn("grep", grepArgs, {
        cwd: searchPath,
        windowsHide: true
      });
      const stdoutChunks = [];
      const stderrChunks = [];
      const onData = (chunk) => stdoutChunks.push(chunk);
      const onStderr = (chunk) => {
        const stderrStr = chunk.toString();
        if (!stderrStr.includes("Permission denied") && !/grep:.*: Is a directory/i.test(stderrStr)) {
          stderrChunks.push(chunk);
        }
      };
      const onError = (err) => {
        cleanup();
        reject(new Error(`Failed to start system grep: ${err.message}`));
      };
      const onClose = (code) => {
        const stdoutData = Buffer.concat(stdoutChunks).toString("utf8");
        const stderrData = Buffer.concat(stderrChunks).toString("utf8").trim();
        cleanup();
        if (code === 0) {
          resolve(stdoutData);
        } else if (code === 1) {
          resolve("");
        } else {
          if (stderrData) {
            reject(
              new Error(`System grep exited with code ${code}: ${stderrData}`)
            );
          } else {
            resolve("");
          }
        }
      };
      const cleanup = () => {
        child.stdout.removeListener("data", onData);
        child.stderr.removeListener("data", onStderr);
        child.removeListener("error", onError);
        child.removeListener("close", onClose);
        if (child.connected) {
          child.disconnect();
        }
      };
      child.stdout.on("data", onData);
      child.stderr.on("data", onStderr);
      child.on("error", onError);
      child.on("close", onClose);
    });
    return new Ok4(output);
  } catch (grepError) {
    return new Err4(normalizeError(grepError));
  }
}
function formatGrepRes(unformattedGrep, basePath) {
  const grepResults = [];
  const grepLines = unformattedGrep.split(EOL);
  for (const line of grepLines) {
    if (!line.trim()) {
      continue;
    }
    const firstColon = line.indexOf(":");
    if (firstColon === -1) {
      continue;
    }
    const secondColon = line.indexOf(":", firstColon + 1);
    if (secondColon === -1) {
      continue;
    }
    const unformattedFilePath = line.substring(0, firstColon);
    const absPath = path7.resolve(basePath, unformattedFilePath);
    const relativePath = path7.relative(basePath, absPath);
    const sLineNumber = line.substring(firstColon + 1, secondColon);
    const lineNumber = parseInt(sLineNumber);
    if (isNaN(lineNumber)) {
      continue;
    }
    const content = line.substring(secondColon + 1);
    grepResults.push({
      filePath: relativePath,
      lineNumber,
      content
    });
  }
  return grepResults;
}

// src/tools/grep.ts
var MAX_RESULTS = 200;
var MAX_LINE_LENGTH = 2e3;
function grepTool(context) {
  return {
    name: "grep",
    description: "Search file contents using regex patterns. Returns matching lines with file paths and line numbers. Uses extended regular expression syntax.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "The regex pattern to search for."
        },
        directory: {
          type: "string",
          description: "Directory to search in. Default: project root."
        },
        file_pattern: {
          type: "string",
          description: 'Optional glob to filter files. E.g. "*.ts", "*.py".'
        }
      },
      required: ["pattern"]
    },
    async execute(input) {
      const pattern = input.pattern;
      const directory = input.directory ? path8.resolve(context.cwd, input.directory) : context.cwd;
      const filePattern = input.file_pattern;
      const grepResult = await performGrep(pattern, directory, filePattern);
      if (grepResult.isErr()) {
        return `Error: ${grepResult.error.message}`;
      }
      const rawOutput = grepResult.value;
      if (!rawOutput.trim()) {
        return "No matches found.";
      }
      const results = formatGrepRes(rawOutput, directory);
      if (results.length === 0) {
        return "No matches found.";
      }
      const limited = results.slice(0, MAX_RESULTS);
      const lines = limited.map((r) => {
        const content = r.content.length > MAX_LINE_LENGTH ? r.content.substring(0, MAX_LINE_LENGTH) + "... [cut]" : r.content;
        return `${r.filePath}:${r.lineNumber}: ${content}`;
      });
      let output = lines.join("\n");
      if (results.length > MAX_RESULTS) {
        output += `

(${results.length - MAX_RESULTS} more results not shown)`;
      }
      return output;
    }
  };
}

// src/tools/askUser.ts
function askUserTool(context) {
  return {
    name: "ask_user",
    description: "Ask the user a question and wait for their response. Use this when you need clarification, approval, or input from the user.",
    inputSchema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The question to ask the user."
        }
      },
      required: ["question"]
    },
    async execute(input) {
      const question = input.question;
      return context.askUser(question);
    }
  };
}

// src/tools/task.ts
function taskTool(context) {
  return {
    name: "task",
    description: 'Launch a sub-agent to handle a task. The sub-agent runs with its own conversation and can use tools independently. Use this for parallel work or isolated tasks. Two modes: "local" spawns a local coding sub-agent, "dust_agent" delegates to a Dust workspace agent.',
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["local", "dust_agent"],
          description: '"local" for a coding sub-agent, "dust_agent" to call a Dust workspace agent.'
        },
        prompt: {
          type: "string",
          description: "The task description or prompt for the sub-agent."
        },
        agent: {
          type: "string",
          description: 'For dust_agent type: the agent name (e.g. "@security-auditor").'
        },
        tools: {
          type: "array",
          items: { type: "string" },
          description: "For local type: subset of tool names to enable. Default: all tools except task."
        }
      },
      required: ["type", "prompt"]
    },
    async execute(input) {
      const taskType = input.type;
      const prompt = input.prompt;
      if (taskType === "dust_agent") {
        const agentName = input.agent;
        if (!agentName) {
          return 'Error: "agent" is required for dust_agent type.';
        }
        if (!context.dustClient) {
          return "Error: Dust client not available.";
        }
        const { callDustAgentTool: callDustAgentTool2 } = await import("./callDustAgent-PXYYER6F.js");
        const tool = callDustAgentTool2(context);
        return tool.execute({ agent: agentName, message: prompt });
      }
      if (taskType === "local") {
        return runLocalSubAgent(context, prompt, input.tools);
      }
      return `Error: Unknown task type "${taskType}". Use "local" or "dust_agent".`;
    }
  };
}
async function runLocalSubAgent(context, prompt, toolSubset) {
  const dustClient = context.dustClient;
  if (!dustClient) {
    return "Error: Dust client not available for sub-agent.";
  }
  const allTools = createTools({
    ...context,
    askUser: async () => "(sub-agent cannot ask user questions directly)"
  });
  let enabledTools = allTools.filter((t) => t.name !== "task");
  if (toolSubset && toolSubset.length > 0) {
    const subsetSet = new Set(toolSubset);
    enabledTools = enabledTools.filter((t) => subsetSet.has(t.name));
  }
  const toolDefs = getToolDefinitions(enabledTools);
  const systemPrompt = buildSystemPrompt(context.cwd) + "\n\nYou are a sub-agent handling a specific task. Complete the task and return a clear summary of what you did.";
  const loop = createAgentLoop({
    dustClient,
    systemPrompt,
    tools: toolDefs,
    executeTool: (call) => executeTool(enabledTools, call, context.approveToolCall),
    maxTokens: 8192
  });
  let responseText = "";
  let isDone = false;
  loop.sendMessage(prompt);
  for await (const event of loop.events()) {
    switch (event.type) {
      case "text_delta":
        responseText += event.text;
        break;
      case "done":
        isDone = true;
        break;
      case "error":
        return `Sub-agent error: ${event.message}`;
    }
    if (isDone) {
      break;
    }
  }
  return responseText || "(sub-agent returned no output)";
}

// src/tools/index.ts
var AUTO_APPROVED_TOOLS = /* @__PURE__ */ new Set(["read_file", "glob", "grep", "ask_user"]);
function createTools(context) {
  const tools = [
    readFileTool(context),
    writeFileTool(context),
    editFileTool(context),
    bashTool(context),
    globTool(context),
    grepTool(context),
    askUserTool(context)
  ];
  if (context.dustClient) {
    tools.push(callDustAgentTool(context));
    tools.push(taskTool(context));
  }
  return tools;
}
function getToolDefinitions(tools) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema
  }));
}
async function executeTool(tools, call, approveToolCall) {
  const tool = tools.find((t) => t.name === call.name);
  if (!tool) {
    return `Error: Unknown tool "${call.name}"`;
  }
  if (!AUTO_APPROVED_TOOLS.has(call.name)) {
    const approved = await approveToolCall(call);
    if (!approved) {
      return "Tool execution rejected by user.";
    }
  }
  try {
    return await tool.execute(call.input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `Error executing ${call.name}: ${message}`;
  }
}

// src/ui/InputBox.tsx
import React3, { useState as useState2 } from "react";
import { Box as Box3, Text as Text3, useInput } from "ink";

// src/ui/CommandSelector.tsx
import { Box as Box2, Text as Text2 } from "ink";
import React2 from "react";
function CommandSelector({
  query,
  selectedIndex,
  commands
}) {
  const filteredCommands = commands.filter(
    (command) => command.name.toLowerCase().startsWith(query.toLowerCase())
  );
  if (filteredCommands.length === 0) {
    return /* @__PURE__ */ React2.createElement(Box2, { flexDirection: "column" }, /* @__PURE__ */ React2.createElement(Box2, { paddingX: 1 }, /* @__PURE__ */ React2.createElement(Text2, { dimColor: true }, "No commands found")));
  }
  return /* @__PURE__ */ React2.createElement(Box2, { flexDirection: "column" }, /* @__PURE__ */ React2.createElement(Box2, { paddingX: 1, flexDirection: "column" }, filteredCommands.map((command, index) => {
    const isSelected = index === selectedIndex;
    return /* @__PURE__ */ React2.createElement(Box2, { key: command.name, flexDirection: "row" }, /* @__PURE__ */ React2.createElement(Box2, { width: 15 }, /* @__PURE__ */ React2.createElement(
      Text2,
      {
        color: isSelected ? "blue" : void 0,
        bold: isSelected
      },
      "/",
      command.name
    )), /* @__PURE__ */ React2.createElement(Text2, { dimColor: !isSelected }, command.description));
  })));
}

// src/ui/InputBox.tsx
function InputBox({
  onSubmit,
  onCommandSelect,
  commands,
  placeholder = "Type a message...",
  disabled = false
}) {
  const [value, setValue] = useState2("");
  const [cursorPosition, setCursorPosition] = useState2(0);
  const [showCommandSelector, setShowCommandSelector] = useState2(false);
  const [commandQuery, setCommandQuery] = useState2("");
  const [selectedCommandIndex, setSelectedCommandIndex] = useState2(0);
  const getFilteredCommands = () => commands.filter(
    (cmd) => cmd.name.toLowerCase().startsWith(commandQuery.toLowerCase())
  );
  const exitCommandMode = () => {
    setShowCommandSelector(false);
    setCommandQuery("");
    setSelectedCommandIndex(0);
  };
  useInput(
    (input, key) => {
      if (disabled) return;
      if (showCommandSelector) {
        if (key.escape) {
          exitCommandMode();
          return;
        }
        if (key.upArrow) {
          setSelectedCommandIndex((prev) => Math.max(0, prev - 1));
          return;
        }
        if (key.downArrow) {
          const filtered = getFilteredCommands();
          setSelectedCommandIndex(
            (prev) => Math.min(filtered.length - 1, prev + 1)
          );
          return;
        }
        if (key.return) {
          const filtered = getFilteredCommands();
          if (filtered.length > 0 && selectedCommandIndex < filtered.length) {
            const selected = filtered[selectedCommandIndex];
            exitCommandMode();
            setValue("");
            setCursorPosition(0);
            onCommandSelect(selected);
          }
          return;
        }
        if (key.backspace || key.delete) {
          if (commandQuery.length > 0) {
            setCommandQuery((prev) => prev.slice(0, -1));
            setSelectedCommandIndex(0);
          } else {
            exitCommandMode();
          }
          return;
        }
        if (!key.ctrl && !key.meta && input && input.length === 1) {
          setCommandQuery((prev) => prev + input);
          setSelectedCommandIndex(0);
        }
        return;
      }
      if (input === "/" && value === "" && cursorPosition === 0 && !key.ctrl && !key.meta) {
        setShowCommandSelector(true);
        setCommandQuery("");
        setSelectedCommandIndex(0);
        return;
      }
      if (key.return) {
        if (cursorPosition > 0 && value[cursorPosition - 1] === "\\") {
          const newValue = value.slice(0, cursorPosition - 1) + "\n" + value.slice(cursorPosition);
          setValue(newValue);
          return;
        }
        if (value.trim()) {
          onSubmit(value.trim());
          setValue("");
          setCursorPosition(0);
        }
        return;
      }
      if (key.backspace || key.delete) {
        if (cursorPosition > 0) {
          setValue(
            value.slice(0, cursorPosition - 1) + value.slice(cursorPosition)
          );
          setCursorPosition(cursorPosition - 1);
        }
        return;
      }
      if (key.ctrl && input === "c") {
        process.exit(0);
      }
      if (key.ctrl && input === "u") {
        setValue("");
        setCursorPosition(0);
        return;
      }
      if (key.ctrl && input === "a") {
        let newPos = cursorPosition;
        while (newPos > 0 && value[newPos - 1] !== "\n") {
          newPos--;
        }
        setCursorPosition(newPos);
        return;
      }
      if (key.ctrl && input === "e") {
        let newPos = cursorPosition;
        while (newPos < value.length && value[newPos] !== "\n") {
          newPos++;
        }
        setCursorPosition(newPos);
        return;
      }
      if (key.meta && input === "b" && cursorPosition > 0) {
        let newPos = cursorPosition - 1;
        while (newPos > 0 && /\s/.test(value[newPos])) {
          newPos--;
        }
        while (newPos > 0 && !/\s/.test(value[newPos - 1])) {
          newPos--;
        }
        setCursorPosition(newPos);
        return;
      }
      if (key.meta && input === "f" && cursorPosition < value.length) {
        let newPos = cursorPosition;
        if (/\s/.test(value[newPos])) {
          while (newPos < value.length && /\s/.test(value[newPos]) && value[newPos] !== "\n") {
            newPos++;
          }
          if (value[newPos] === "\n") {
            setCursorPosition(newPos);
            return;
          }
        } else {
          while (newPos < value.length && !/\s/.test(value[newPos])) {
            newPos++;
          }
          while (newPos < value.length && /\s/.test(value[newPos]) && value[newPos] !== "\n") {
            newPos++;
          }
        }
        setCursorPosition(newPos);
        return;
      }
      if (key.leftArrow && cursorPosition > 0) {
        setCursorPosition(cursorPosition - 1);
        return;
      }
      if (key.rightArrow && cursorPosition < value.length) {
        setCursorPosition(cursorPosition + 1);
        return;
      }
      if (key.upArrow) {
        const lines2 = value.split("\n");
        let pos = 0;
        let lineIndex = 0;
        let posInLine = 0;
        for (let i = 0; i < lines2.length; i++) {
          if (cursorPosition >= pos && cursorPosition <= pos + lines2[i].length) {
            lineIndex = i;
            posInLine = cursorPosition - pos;
            break;
          }
          pos += lines2[i].length + 1;
        }
        if (lineIndex > 0) {
          const prevLineLength = lines2[lineIndex - 1].length;
          const newPosInLine = Math.min(posInLine, prevLineLength);
          let newCursorPos = 0;
          for (let i = 0; i < lineIndex - 1; i++) {
            newCursorPos += lines2[i].length + 1;
          }
          newCursorPos += newPosInLine;
          setCursorPosition(newCursorPos);
        } else {
          setCursorPosition(0);
        }
        return;
      }
      if (key.downArrow) {
        const lines2 = value.split("\n");
        let pos = 0;
        let lineIndex = 0;
        let posInLine = 0;
        for (let i = 0; i < lines2.length; i++) {
          if (cursorPosition >= pos && cursorPosition <= pos + lines2[i].length) {
            lineIndex = i;
            posInLine = cursorPosition - pos;
            break;
          }
          pos += lines2[i].length + 1;
        }
        if (lineIndex < lines2.length - 1) {
          const nextLineLength = lines2[lineIndex + 1].length;
          const newPosInLine = Math.min(posInLine, nextLineLength);
          let newCursorPos = 0;
          for (let i = 0; i <= lineIndex; i++) {
            newCursorPos += lines2[i].length + 1;
          }
          newCursorPos += newPosInLine;
          setCursorPosition(newCursorPos);
        } else {
          setCursorPosition(value.length);
        }
        return;
      }
      if (!key.ctrl && !key.meta && input) {
        if (input.length > 1) {
          const normalized = input.replace(/\r/g, "\n");
          const newValue = value.slice(0, cursorPosition) + normalized + value.slice(cursorPosition);
          setValue(newValue);
          setCursorPosition(cursorPosition + normalized.length);
        } else {
          const newValue = value.slice(0, cursorPosition) + input + value.slice(cursorPosition);
          setValue(newValue);
          setCursorPosition(cursorPosition + 1);
        }
      }
    },
    { isActive: !disabled }
  );
  const displayValue = showCommandSelector ? `/${commandQuery}` : value;
  const displayCursorPosition = showCommandSelector ? commandQuery.length + 1 : cursorPosition;
  const lines = displayValue.split("\n");
  let currentPos = 0;
  let cursorLine = 0;
  let cursorPosInLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (displayCursorPosition >= currentPos && displayCursorPosition <= currentPos + lines[i].length) {
      cursorLine = i;
      cursorPosInLine = displayCursorPosition - currentPos;
      break;
    }
    currentPos += lines[i].length + 1;
  }
  return /* @__PURE__ */ React3.createElement(Box3, { flexDirection: "column" }, showCommandSelector && !disabled && /* @__PURE__ */ React3.createElement(
    CommandSelector,
    {
      query: commandQuery,
      selectedIndex: selectedCommandIndex,
      commands
    }
  ), /* @__PURE__ */ React3.createElement(
    Box3,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: disabled ? "gray" : "blue",
      paddingLeft: 1,
      paddingRight: 1
    },
    displayValue ? lines.map((line, index) => /* @__PURE__ */ React3.createElement(Box3, { key: index }, index === 0 && /* @__PURE__ */ React3.createElement(Text3, { color: "blue", bold: true }, ">", " "), index !== 0 && /* @__PURE__ */ React3.createElement(Text3, null, "  "), !disabled && index === cursorLine ? /* @__PURE__ */ React3.createElement(React3.Fragment, null, /* @__PURE__ */ React3.createElement(Text3, null, line.substring(0, cursorPosInLine)), /* @__PURE__ */ React3.createElement(Text3, { backgroundColor: "blue", color: "white" }, line.charAt(cursorPosInLine) || " "), /* @__PURE__ */ React3.createElement(Text3, null, line.substring(cursorPosInLine + 1))) : /* @__PURE__ */ React3.createElement(Text3, null, line === "" ? " " : line))) : /* @__PURE__ */ React3.createElement(Box3, null, /* @__PURE__ */ React3.createElement(Text3, { color: "blue", bold: true }, ">", " "), disabled ? /* @__PURE__ */ React3.createElement(Text3, null, " ") : /* @__PURE__ */ React3.createElement(React3.Fragment, null, /* @__PURE__ */ React3.createElement(Text3, { backgroundColor: "blue", color: "white" }, " "), /* @__PURE__ */ React3.createElement(Text3, { dimColor: true }, " ", placeholder)))
  ), !disabled && /* @__PURE__ */ React3.createElement(Box3, { marginLeft: 1 }, /* @__PURE__ */ React3.createElement(Text3, { dimColor: true }, showCommandSelector ? "\u2191\u2193 to navigate \xB7 Enter to select \xB7 Esc to cancel" : "Enter to send \xB7 \\Enter for newline \xB7 / for commands \xB7 Ctrl+C to exit")));
}

// src/ui/ToolApprovalSelector.tsx
import { Box as Box4, Text as Text4, useInput as useInput2 } from "ink";
import React4, { useState as useState3 } from "react";
var APPROVAL_OPTIONS = [
  { id: "approve", label: "Approve", description: "Execute this tool call" },
  {
    id: "reject",
    label: "Reject",
    description: "Block and return error to agent"
  }
];
function getToolSummary(call) {
  const input = call.input;
  switch (call.name) {
    case "bash":
      return typeof input.command === "string" ? input.command : "";
    case "edit_file":
    case "write_file":
    case "read_file":
      return typeof input.path === "string" ? input.path : "";
    case "call_dust_agent":
      return typeof input.agent === "string" ? input.agent : "";
    case "task":
      return typeof input.description === "string" ? input.description : "";
    default:
      return JSON.stringify(input, null, 2);
  }
}
var ToolApprovalSelector = ({
  call,
  onApproval
}) => {
  const [cursor, setCursor] = useState3(0);
  useInput2((_input, key) => {
    if (key.upArrow) {
      setCursor((prev) => prev > 0 ? prev - 1 : APPROVAL_OPTIONS.length - 1);
      return;
    }
    if (key.downArrow) {
      setCursor((prev) => prev < APPROVAL_OPTIONS.length - 1 ? prev + 1 : 0);
      return;
    }
    if (key.return) {
      const selectedOption = APPROVAL_OPTIONS[cursor];
      onApproval(selectedOption.id === "approve");
      return;
    }
  });
  const summary = getToolSummary(call);
  return /* @__PURE__ */ React4.createElement(Box4, { flexDirection: "column" }, /* @__PURE__ */ React4.createElement(Box4, { paddingX: 1, flexDirection: "column", marginTop: 1 }, /* @__PURE__ */ React4.createElement(Text4, { color: "yellow", bold: true }, call.name), summary && /* @__PURE__ */ React4.createElement(Text4, null, summary)), /* @__PURE__ */ React4.createElement(Box4, { paddingX: 1, flexDirection: "column" }, APPROVAL_OPTIONS.map((option, index) => {
    const isSelected = index === cursor;
    return /* @__PURE__ */ React4.createElement(Box4, { key: option.id, flexDirection: "row" }, /* @__PURE__ */ React4.createElement(Box4, { width: 15 }, /* @__PURE__ */ React4.createElement(
      Text4,
      {
        color: isSelected ? "blue" : void 0,
        bold: isSelected
      },
      option.label
    )), /* @__PURE__ */ React4.createElement(Text4, { dimColor: !isSelected }, option.description));
  })));
};

// src/ui/ToolExecution.tsx
import React5 from "react";
import { Box as Box5, Text as Text5 } from "ink";
var TOOL_LABELS = {
  read_file: "Read",
  write_file: "Write",
  edit_file: "Edit",
  bash: "Bash",
  grep: "Search",
  glob: "Files",
  ask_user: "Ask",
  call_dust_agent: "Agent",
  task: "Task"
};
function getLabel(name) {
  return TOOL_LABELS[name] || name;
}
function getPrimaryParam(name, input) {
  if (["read_file", "write_file", "edit_file"].includes(name)) {
    const p = input.path || input.file_path || input.filePath;
    return typeof p === "string" ? shortenFilePath(p) : "";
  }
  if (name === "bash") {
    const cmd = input.command;
    return typeof cmd === "string" ? truncate(cmd, 60) : "";
  }
  if (name === "grep") {
    const pattern = input.pattern || input.query;
    return typeof pattern === "string" ? truncate(pattern, 60) : "";
  }
  if (name === "glob") {
    const pattern = input.pattern || input.glob;
    return typeof pattern === "string" ? truncate(pattern, 60) : "";
  }
  if (name === "call_dust_agent") {
    const agent = input.agent_name || input.agentName;
    return typeof agent === "string" ? agent : "";
  }
  for (const val of Object.values(input)) {
    if (typeof val === "string") {
      return truncate(val, 60);
    }
  }
  return "";
}
function shortenFilePath(p) {
  const parts = p.split("/");
  if (parts.length > 4) {
    return ".../" + parts.slice(-3).join("/");
  }
  return p;
}
function truncate(str, maxLength) {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + "\u2026";
}
function formatDuration(seconds) {
  if (seconds < 0.1) return "";
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  return `${Math.round(seconds)}s`;
}
function buildDiffLines(oldStr, newStr) {
  const lines = [];
  for (const line of oldStr.split("\n")) {
    lines.push({ content: line, type: "remove" });
  }
  for (const line of newStr.split("\n")) {
    lines.push({ content: line, type: "add" });
  }
  return lines;
}
function formatResult(result) {
  const lines = result.split("\n").filter((l) => l.trim());
  return lines.slice(0, 10);
}
function ToolExecution({ toolCalls }) {
  return /* @__PURE__ */ React5.createElement(Box5, { flexDirection: "column" }, toolCalls.map((tc) => {
    const label = getLabel(tc.name);
    const param = getPrimaryParam(tc.name, tc.input);
    const isRejected = tc.result === "Tool execution rejected by user.";
    const isError = isRejected || (tc.result ? tc.result.toLowerCase().startsWith("error") : false);
    const duration = tc.duration ? formatDuration(tc.duration) : "";
    return /* @__PURE__ */ React5.createElement(Box5, { key: tc.id, flexDirection: "column" }, /* @__PURE__ */ React5.createElement(Box5, null, /* @__PURE__ */ React5.createElement(
      Text5,
      {
        color: tc.status === "executing" ? "yellow" : isError ? "red" : "green"
      },
      tc.status === "executing" ? "  \u27F3 " : isError ? "  \u2717 " : "  \u2713 "
    ), /* @__PURE__ */ React5.createElement(
      Text5,
      {
        bold: true,
        color: tc.status === "executing" ? "yellow" : isError ? "red" : "green"
      },
      label
    ), /* @__PURE__ */ React5.createElement(Text5, { color: "gray" }, "  ", param), duration && /* @__PURE__ */ React5.createElement(Text5, { dimColor: true }, "  ", duration)), tc.result && isError && /* @__PURE__ */ React5.createElement(Box5, { marginLeft: 4, flexDirection: "column" }, formatResult(tc.result).map((line, i) => /* @__PURE__ */ React5.createElement(Text5, { key: i, color: "red", dimColor: true }, line))), tc.name === "edit_file" && tc.status === "executing" && typeof tc.input.old_string === "string" && typeof tc.input.new_string === "string" && /* @__PURE__ */ React5.createElement(Box5, { marginLeft: 4, flexDirection: "column" }, buildDiffLines(
      tc.input.old_string,
      tc.input.new_string
    ).map((line, i) => /* @__PURE__ */ React5.createElement(
      Text5,
      {
        key: i,
        backgroundColor: line.type === "remove" ? "#3c1518" : "#132d13"
      },
      /* @__PURE__ */ React5.createElement(
        Text5,
        {
          color: line.type === "remove" ? "red" : "green",
          bold: true
        },
        line.type === "remove" ? " - " : " + "
      ),
      /* @__PURE__ */ React5.createElement(Text5, null, line.content, " ")
    ))));
  }));
}

// src/ui/WelcomeHeader.tsx
import React6 from "react";
import { Box as Box6, Text as Text6 } from "ink";
import { execSync as execSync2 } from "child_process";
import { homedir } from "os";
function getGitBranch2(cwd2) {
  try {
    return execSync2("git rev-parse --abbrev-ref HEAD", {
      cwd: cwd2,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
  } catch {
    return "n/a";
  }
}
function shortenPath(p) {
  const home = homedir();
  if (p.startsWith(home)) {
    return "~" + p.slice(home.length);
  }
  return p;
}
function WelcomeHeader({ cwd: cwd2 }) {
  const branch = getGitBranch2(cwd2);
  const shortCwd = shortenPath(cwd2);
  return /* @__PURE__ */ React6.createElement(Box6, { marginTop: 1, marginBottom: 1 }, /* @__PURE__ */ React6.createElement(Box6, { flexDirection: "column", marginRight: 2 }, /* @__PURE__ */ React6.createElement(Box6, null, /* @__PURE__ */ React6.createElement(Text6, { color: "green", dimColor: true }, "\u2588"), /* @__PURE__ */ React6.createElement(Text6, { color: "green" }, "\u2580\u2584 "), /* @__PURE__ */ React6.createElement(Text6, { color: "red", dimColor: true }, "\u2588 \u2588")), /* @__PURE__ */ React6.createElement(Box6, null, /* @__PURE__ */ React6.createElement(Text6, { color: "green", dimColor: true }, "\u2588"), /* @__PURE__ */ React6.createElement(Text6, { color: "green" }, "\u2584\u2580 "), /* @__PURE__ */ React6.createElement(Text6, { color: "red" }, "\u2588\u2584\u2588")), /* @__PURE__ */ React6.createElement(Box6, null, /* @__PURE__ */ React6.createElement(Text6, { color: "blue", dimColor: true }, "\u2588\u2580\u2580 "), /* @__PURE__ */ React6.createElement(Text6, { color: "blue", dimColor: true }, "\u2580\u2588\u2580")), /* @__PURE__ */ React6.createElement(Box6, null, /* @__PURE__ */ React6.createElement(Text6, { color: "blue" }, "\u2584\u2588\u2588 "), /* @__PURE__ */ React6.createElement(Text6, { color: "yellow", dimColor: true }, " \u2588 "))), /* @__PURE__ */ React6.createElement(Box6, { flexDirection: "column", justifyContent: "center" }, /* @__PURE__ */ React6.createElement(Text6, { dimColor: true }, "Dust Coding CLI \xB7 ", shortCwd), /* @__PURE__ */ React6.createElement(Text6, { dimColor: true }, "Branch: ", /* @__PURE__ */ React6.createElement(Text6, { bold: true, dimColor: true }, branch), " \xB7 ", "Type ", /* @__PURE__ */ React6.createElement(Text6, { bold: true, dimColor: true }, "/help"), " for commands"), /* @__PURE__ */ React6.createElement(Text6, { dimColor: true }, "Enter to send \xB7 \\Enter for newline \xB7 Ctrl+C to exit")));
}

// src/ui/commands/types.ts
var createCommands = (context) => [
  {
    name: "help",
    description: "Show commands and keyboard shortcuts",
    execute: () => {
      if (context.showHelp) {
        context.showHelp();
      }
    }
  },
  {
    name: "clear",
    description: "Clear conversation history",
    execute: () => {
      if (context.clearConversation) {
        context.clearConversation();
      }
    }
  },
  {
    name: "status",
    description: "Show token usage and session info",
    execute: () => {
      if (context.showStatus) {
        context.showStatus();
      }
    }
  },
  {
    name: "exit",
    description: "Exit the CLI",
    execute: () => {
      process.exit(0);
    }
  }
];

// src/ui/Chat.tsx
function formatTokenCount(n) {
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return `${n}`;
}
var SEPARATOR = "\u2500".repeat(50);
function Chat({ dustClient, cwd: cwd2, initialPrompt: initialPrompt2 }) {
  const [history, setHistory] = useState4([
    { type: "welcome", id: "welcome" }
  ]);
  const [liveItems, setLiveItems] = useState4([]);
  const [isProcessing, setIsProcessing] = useState4(false);
  const [totalTokens, setTotalTokens] = useState4({ input: 0, output: 0 });
  const askUserResolverRef = useRef(null);
  const [pendingQuestion, setPendingQuestion] = useState4(null);
  const approvalResolverRef = useRef(
    null
  );
  const [pendingApproval, setPendingApproval] = useState4(null);
  const loopRef = useRef(null);
  const idCounter = useRef(0);
  const nextId = useCallback2(() => {
    idCounter.current += 1;
    return `item-${idCounter.current}`;
  }, []);
  useEffect2(() => {
    const approveToolCall = (call) => {
      return new Promise((resolve) => {
        setPendingApproval(call);
        approvalResolverRef.current = resolve;
      });
    };
    const toolContext = {
      cwd: cwd2,
      dustClient,
      askUser: async (question) => {
        return new Promise((resolve) => {
          setPendingQuestion(question);
          askUserResolverRef.current = resolve;
        });
      },
      approveToolCall
    };
    const tools = createTools(toolContext);
    const toolDefs = getToolDefinitions(tools);
    const systemPrompt = buildSystemPrompt(cwd2);
    const loop = createAgentLoop({
      dustClient,
      systemPrompt,
      tools: toolDefs,
      executeTool: (call) => executeTool(tools, call, approveToolCall)
    });
    loopRef.current = loop;
    (async () => {
      for await (const event of loop.events()) {
        handleEvent(event);
      }
    })();
    if (initialPrompt2) {
      setIsProcessing(true);
      setHistory((prev) => [
        ...prev,
        { id: nextId(), type: "user", content: initialPrompt2 },
        { id: nextId(), type: "separator" }
      ]);
      loop.sendMessage(initialPrompt2);
    }
  }, []);
  const handleEvent = useCallback2(
    (event) => {
      switch (event.type) {
        case "thinking_delta":
          setLiveItems((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.type === "thinking") {
              return [
                ...prev.slice(0, -1),
                { ...last, text: last.text + event.text }
              ];
            }
            return [
              ...prev,
              { type: "thinking", id: `live-${Date.now()}`, text: event.text }
            ];
          });
          break;
        case "text_delta":
          setLiveItems((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.type === "text") {
              return [
                ...prev.slice(0, -1),
                { ...last, text: last.text + event.text }
              ];
            }
            return [
              ...prev,
              { type: "text", id: `live-${Date.now()}`, text: event.text }
            ];
          });
          break;
        case "tool_use":
          setLiveItems((prev) => [
            ...prev,
            {
              type: "tool_call",
              id: `live-tc-${event.id}`,
              call: {
                id: event.id,
                name: event.name,
                input: event.input,
                status: "executing",
                startTime: Date.now()
              }
            }
          ]);
          break;
        case "tool_executing":
          setLiveItems(
            (prev) => prev.map(
              (item) => item.type === "tool_call" && item.call.id === event.id ? {
                ...item,
                call: { ...item.call, status: "executing" }
              } : item
            )
          );
          break;
        case "tool_result":
          setLiveItems(
            (prev) => prev.map(
              (item) => item.type === "tool_call" && item.call.id === event.id ? {
                ...item,
                call: {
                  ...item.call,
                  status: "done",
                  result: event.result,
                  duration: item.call.startTime ? (Date.now() - item.call.startTime) / 1e3 : void 0
                }
              } : item
            )
          );
          break;
        case "usage":
          setTotalTokens((prev) => ({
            input: prev.input + event.inputTokens,
            output: prev.output + event.outputTokens
          }));
          break;
        case "done":
          setLiveItems((prev) => {
            if (prev.length > 0) {
              const historyItems = prev.map((item) => {
                switch (item.type) {
                  case "thinking":
                    return {
                      type: "thinking",
                      id: item.id,
                      content: item.text
                    };
                  case "text":
                    return {
                      type: "text",
                      id: item.id,
                      content: item.text
                    };
                  case "tool_call":
                    return {
                      type: "tool_call",
                      id: item.id,
                      call: item.call
                    };
                }
              });
              setHistory((h) => [
                ...h,
                ...historyItems,
                { type: "separator", id: `sep-${Date.now()}` }
              ]);
            }
            return [];
          });
          setIsProcessing(false);
          break;
        case "error":
          setLiveItems([]);
          setHistory((prev) => [
            ...prev,
            { type: "error", id: `err-${Date.now()}`, content: event.message },
            { type: "separator", id: `sep-${Date.now()}` }
          ]);
          setIsProcessing(false);
          break;
      }
    },
    [nextId]
  );
  const commands = useMemo(
    () => createCommands({
      showHelp: () => {
        setHistory((prev) => [
          ...prev,
          {
            id: nextId(),
            type: "info",
            content: [
              "Available commands:",
              "  /help    \u2014 Show this help message",
              "  /clear   \u2014 Clear conversation history",
              "  /status  \u2014 Show token usage and session info",
              "  /exit    \u2014 Exit the CLI",
              "",
              "Keyboard shortcuts:",
              "  Enter       \u2014 Send message",
              "  \\Enter     \u2014 Insert newline",
              "  Ctrl+U      \u2014 Clear input",
              "  Ctrl+A/E    \u2014 Jump to line start/end",
              "  Opt+\u2190/\u2192     \u2014 Jump by word",
              "  \u2191/\u2193         \u2014 Move between lines",
              "  /           \u2014 Open command selector",
              "  Ctrl+C      \u2014 Exit"
            ].join("\n")
          },
          { id: nextId(), type: "separator" }
        ]);
      },
      clearConversation: () => {
        setHistory([{ type: "welcome", id: "welcome" }]);
        setLiveItems([]);
      },
      showStatus: () => {
        setHistory((prev) => [
          ...prev,
          {
            id: nextId(),
            type: "info",
            content: [
              `Directory: ${cwd2}`,
              `Tokens: ${formatTokenCount(totalTokens.input)} in / ${formatTokenCount(totalTokens.output)} out`,
              `Messages: ${history.filter((h) => h.type === "user").length} sent`,
              `Processing: ${isProcessing ? "yes" : "no"}`
            ].join("\n")
          },
          { id: nextId(), type: "separator" }
        ]);
      }
    }),
    [nextId, cwd2, totalTokens, history, isProcessing]
  );
  const handleCommandSelect = useCallback2((command) => {
    void command.execute({});
  }, []);
  const handleSubmit = useCallback2(
    (text) => {
      if (pendingQuestion && askUserResolverRef.current) {
        askUserResolverRef.current(text);
        askUserResolverRef.current = null;
        setPendingQuestion(null);
        return;
      }
      if (!loopRef.current || isProcessing) {
        return;
      }
      setIsProcessing(true);
      setHistory((prev) => [
        ...prev,
        { id: nextId(), type: "user", content: text },
        { id: nextId(), type: "separator" }
      ]);
      loopRef.current.sendMessage(text);
    },
    [isProcessing, nextId, pendingQuestion]
  );
  const hasActiveToolCall = liveItems.some(
    (item) => item.type === "tool_call" && item.call.status === "executing"
  );
  return /* @__PURE__ */ React7.createElement(Box7, { flexDirection: "column", padding: 1 }, /* @__PURE__ */ React7.createElement(Static, { items: history }, (item) => {
    switch (item.type) {
      case "welcome":
        return /* @__PURE__ */ React7.createElement(Box7, { key: item.id }, /* @__PURE__ */ React7.createElement(WelcomeHeader, { cwd: cwd2 }));
      case "user":
        return /* @__PURE__ */ React7.createElement(Box7, { key: item.id, flexDirection: "column" }, /* @__PURE__ */ React7.createElement(Text7, { color: "green", bold: true }, "You"), /* @__PURE__ */ React7.createElement(Text7, null, item.content));
      case "thinking":
        return /* @__PURE__ */ React7.createElement(Box7, { key: item.id }, /* @__PURE__ */ React7.createElement(Text7, { color: "gray", dimColor: true, italic: true }, item.content));
      case "text":
        return /* @__PURE__ */ React7.createElement(Box7, { key: item.id }, /* @__PURE__ */ React7.createElement(Text7, null, item.content));
      case "tool_call":
        return /* @__PURE__ */ React7.createElement(Box7, { key: item.id }, /* @__PURE__ */ React7.createElement(ToolExecution, { toolCalls: [item.call] }));
      case "info":
        return /* @__PURE__ */ React7.createElement(Box7, { key: item.id }, /* @__PURE__ */ React7.createElement(Text7, { dimColor: true }, item.content));
      case "error":
        return /* @__PURE__ */ React7.createElement(Box7, { key: item.id }, /* @__PURE__ */ React7.createElement(Text7, { color: "red", bold: true }, "\u2717 Error: ", /* @__PURE__ */ React7.createElement(Text7, { color: "red" }, item.content)));
      case "separator":
        return /* @__PURE__ */ React7.createElement(Box7, { key: item.id }, /* @__PURE__ */ React7.createElement(Text7, { dimColor: true }, SEPARATOR));
    }
  }), liveItems.map((item) => {
    switch (item.type) {
      case "thinking":
        return /* @__PURE__ */ React7.createElement(Box7, { key: item.id }, /* @__PURE__ */ React7.createElement(Text7, { color: "gray", dimColor: true, italic: true }, item.text));
      case "text":
        return /* @__PURE__ */ React7.createElement(Box7, { key: item.id }, /* @__PURE__ */ React7.createElement(Text7, null, item.text));
      case "tool_call":
        return /* @__PURE__ */ React7.createElement(Box7, { key: item.id }, /* @__PURE__ */ React7.createElement(ToolExecution, { toolCalls: [item.call] }));
    }
  }), isProcessing && liveItems.length === 0 && /* @__PURE__ */ React7.createElement(Box7, null, /* @__PURE__ */ React7.createElement(Text7, { color: "blue" }, /* @__PURE__ */ React7.createElement(Spinner2, { type: "dots" })), /* @__PURE__ */ React7.createElement(Text7, { color: "gray" }, " Thinking...")), isProcessing && hasActiveToolCall && /* @__PURE__ */ React7.createElement(Box7, null, /* @__PURE__ */ React7.createElement(Text7, { color: "blue" }, /* @__PURE__ */ React7.createElement(Spinner2, { type: "dots" })), /* @__PURE__ */ React7.createElement(Text7, { color: "gray" }, " Running...")), pendingApproval && /* @__PURE__ */ React7.createElement(
    ToolApprovalSelector,
    {
      call: pendingApproval,
      onApproval: (approved) => {
        if (approvalResolverRef.current) {
          approvalResolverRef.current(approved);
          approvalResolverRef.current = null;
        }
        setPendingApproval(null);
      }
    }
  ), pendingQuestion && /* @__PURE__ */ React7.createElement(Box7, { paddingX: 1, flexDirection: "column", marginTop: 1 }, /* @__PURE__ */ React7.createElement(Box7, { width: 15 }, /* @__PURE__ */ React7.createElement(Text7, { color: "blue", bold: true }, "Agent asks")), /* @__PURE__ */ React7.createElement(Text7, null, pendingQuestion)), /* @__PURE__ */ React7.createElement(
    InputBox,
    {
      onSubmit: handleSubmit,
      onCommandSelect: handleCommandSelect,
      commands,
      disabled: isProcessing && !pendingQuestion || !!pendingApproval,
      placeholder: pendingQuestion ? "Answer the agent's question..." : "Type a message..."
    }
  ), (totalTokens.input > 0 || totalTokens.output > 0) && /* @__PURE__ */ React7.createElement(Box7, { marginTop: 1 }, /* @__PURE__ */ React7.createElement(Text7, { dimColor: true }, "tokens: ", formatTokenCount(totalTokens.input), " in /", " ", formatTokenCount(totalTokens.output), " out")));
}

// src/ui/WorkspaceSelector.tsx
import { Box as Box8, Text as Text8, useInput as useInput3 } from "ink";
import Spinner3 from "ink-spinner";
import React8, { useEffect as useEffect3, useState as useState5 } from "react";
function WorkspaceSelector({ onComplete }) {
  const [isLoading, setIsLoading] = useState5(true);
  const [workspaces, setWorkspaces] = useState5([]);
  const [selectedIndex, setSelectedIndex] = useState5(0);
  const [error, setError] = useState5(null);
  useEffect3(() => {
    (async () => {
      try {
        setIsLoading(true);
        const clientRes = await getDustClient();
        if (clientRes.isErr()) {
          setError(clientRes.error.message);
          return;
        }
        const client = clientRes.value;
        if (!client) {
          setError("Failed to initialize API client. Please authenticate first.");
          setIsLoading(false);
          return;
        }
        const meResponse = await client.me();
        if (meResponse.isErr()) {
          setError(`Error fetching workspaces: ${meResponse.error.message}`);
          setIsLoading(false);
          return;
        }
        const userWorkspaces = meResponse.value.workspaces || [];
        if (userWorkspaces.length === 0) {
          setError("You don't have any workspaces. Visit https://dust.tt to create one.");
          setIsLoading(false);
          return;
        }
        if (userWorkspaces.length === 1) {
          await tokenStorage_default.saveWorkspaceId(userWorkspaces[0].sId);
          resetDustClient();
          setIsLoading(false);
          onComplete();
          return;
        }
        setWorkspaces(userWorkspaces);
        setIsLoading(false);
      } catch (err) {
        setError(`Failed to fetch workspaces: ${err instanceof Error ? err.message : String(err)}`);
        setIsLoading(false);
      }
    })();
  }, [onComplete]);
  useInput3(
    (input, key) => {
      if (workspaces.length === 0) {
        return;
      }
      if (key.upArrow) {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedIndex((prev) => Math.min(workspaces.length - 1, prev + 1));
      } else if (key.return) {
        const selected = workspaces[selectedIndex];
        (async () => {
          await tokenStorage_default.saveWorkspaceId(selected.sId);
          resetDustClient();
          onComplete();
        })();
      }
    },
    { isActive: workspaces.length > 0 }
  );
  if (isLoading) {
    return /* @__PURE__ */ React8.createElement(Box8, null, /* @__PURE__ */ React8.createElement(Text8, { color: "green" }, /* @__PURE__ */ React8.createElement(Spinner3, { type: "dots" })), /* @__PURE__ */ React8.createElement(Text8, null, " Loading your workspaces..."));
  }
  if (error) {
    return /* @__PURE__ */ React8.createElement(Box8, { flexDirection: "column" }, /* @__PURE__ */ React8.createElement(Text8, { color: "red" }, "Error: ", error));
  }
  return /* @__PURE__ */ React8.createElement(Box8, { flexDirection: "column" }, /* @__PURE__ */ React8.createElement(Box8, { marginBottom: 1 }, /* @__PURE__ */ React8.createElement(Text8, { bold: true }, "Select a workspace:")), workspaces.map((ws, i) => /* @__PURE__ */ React8.createElement(Box8, { key: ws.sId }, /* @__PURE__ */ React8.createElement(Text8, { color: i === selectedIndex ? "blue" : void 0 }, i === selectedIndex ? "> " : "  ", ws.name, " (", ws.role, ")"))));
}

// src/ui/App.tsx
function App({ cwd: cwd2, initialPrompt: initialPrompt2, apiKey, wId }) {
  const [state, setState] = useState6("checking");
  const [dustClient, setDustClient] = useState6(null);
  const [error, setError] = useState6(null);
  const initializeClient = useCallback4(async () => {
    const workspaceId = await tokenStorage_default.getWorkspaceId();
    if (!workspaceId || workspaceId === "me") {
      setState("select_workspace");
      return;
    }
    resetDustClient();
    const clientRes = await getDustClient();
    if (clientRes.isErr()) {
      setError(clientRes.error.message);
      setState("error");
      return;
    }
    const client = clientRes.value;
    if (!client) {
      setState("auth");
      return;
    }
    setDustClient(client);
    setState("ready");
  }, []);
  useEffect4(() => {
    (async () => {
      const isAuth = await authService_default.isAuthenticated();
      if (isAuth) {
        await initializeClient();
      } else {
        setState("auth");
      }
    })();
  }, [initializeClient]);
  const handleAuthComplete = useCallback4(async () => {
    await initializeClient();
  }, [initializeClient]);
  const handleWorkspaceSelected = useCallback4(async () => {
    resetDustClient();
    const clientRes = await getDustClient();
    if (clientRes.isErr()) {
      setError(clientRes.error.message);
      setState("error");
      return;
    }
    const client = clientRes.value;
    if (!client) {
      setError("Failed to initialize client after workspace selection.");
      setState("error");
      return;
    }
    setDustClient(client);
    setState("ready");
  }, []);
  if (state === "checking") {
    return /* @__PURE__ */ React9.createElement(Box9, null, /* @__PURE__ */ React9.createElement(Text9, { color: "green" }, /* @__PURE__ */ React9.createElement(Spinner4, { type: "dots" })), /* @__PURE__ */ React9.createElement(Text9, null, " Starting Dust Coding CLI..."));
  }
  if (state === "auth") {
    return /* @__PURE__ */ React9.createElement(Auth, { onComplete: handleAuthComplete, apiKey, wId });
  }
  if (state === "select_workspace") {
    return /* @__PURE__ */ React9.createElement(WorkspaceSelector, { onComplete: handleWorkspaceSelected });
  }
  if (state === "error" || !dustClient) {
    return /* @__PURE__ */ React9.createElement(Box9, { flexDirection: "column" }, /* @__PURE__ */ React9.createElement(Text9, { color: "red" }, "Error: ", error ?? "Failed to initialize."), /* @__PURE__ */ React9.createElement(Text9, null, "Try running again or check your authentication."));
  }
  return /* @__PURE__ */ React9.createElement(Chat, { dustClient, cwd: cwd2, initialPrompt: initialPrompt2 });
}

// src/index.tsx
var cli = meow(
  `
  Usage
    $ dust-code [prompt]

  Options
    --api-key   Dust API key (or set DUST_API_KEY env var)
    --wId       Workspace ID (or set DUST_WORKSPACE_ID env var)
    --cwd       Working directory (default: current directory)

  Examples
    $ dust-code
    $ dust-code "Fix the failing tests in src/utils/"
    $ dust-code --api-key sk-xxx --wId abc123 "Explain the codebase"
`,
  {
    importMeta: import.meta,
    flags: {
      apiKey: {
        type: "string"
      },
      wId: {
        type: "string"
      },
      cwd: {
        type: "string",
        default: process.cwd()
      }
    }
  }
);
var initialPrompt = cli.input.join(" ") || void 0;
var cwd = cli.flags.cwd;
render(
  /* @__PURE__ */ React10.createElement(
    App,
    {
      cwd,
      initialPrompt,
      apiKey: cli.flags.apiKey,
      wId: cli.flags.wId
    }
  )
);
//# sourceMappingURL=index.js.map