import { MCPError } from "@app/lib/actions/mcp_errors";
import { OUTLOOK_MAIL_FOLDER_LIST_MIME_TYPE } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type {
  ToolHandlerExtra,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  extractTextFromBuffer,
  processAttachment,
} from "@app/lib/actions/mcp_internal_actions/utils/attachment_processing";
import {
  getFileFromConversationAttachment,
  sanitizeFilename,
} from "@app/lib/actions/mcp_internal_actions/utils/file_utils";
import { getAllowedLabelsForMCPServer } from "@app/lib/api/actions/servers/microsoft/utils";
import { OUTLOOK_TOOLS_METADATA } from "@app/lib/api/actions/servers/outlook/mail_metadata";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { Err, Ok } from "@app/types/shared/result";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";

const MAX_ATTACHMENT_SIZE_BYTES = 3 * 1024 * 1024; // 3MB — Graph API inline attachment limit

async function fetchAttachment(
  auth: ToolHandlerExtra["auth"],
  attachmentFilePath: string | undefined,
  agentLoopContext: ToolHandlerExtra["agentLoopContext"]
): Promise<
  | Ok<{ buffer: Buffer; filename: string; contentType: string } | null>
  | Err<MCPError>
> {
  if (!attachmentFilePath) {
    return new Ok(null);
  }

  if (!agentLoopContext) {
    return new Err(new MCPError("No agent context available"));
  }

  const fileResult = await getFileFromConversationAttachment(
    auth,
    attachmentFilePath,
    agentLoopContext
  );

  if (fileResult.isErr()) {
    return new Err(
      new MCPError(`File not found: ${attachmentFilePath}`, { tracked: false })
    );
  }

  const { buffer, filename, contentType } = fileResult.value;

  if (buffer.length > MAX_ATTACHMENT_SIZE_BYTES) {
    return new Err(
      new MCPError(
        `Attachment file size exceeds the ${MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)}MB limit.`
      )
    );
  }

  return new Ok({ buffer, filename, contentType });
}

// Builds the Microsoft Graph fileAttachment payload shared by the direct-send
// (inline) and draft (POST /attachments) paths.
function buildFileAttachmentPayload(attachment: {
  buffer: Buffer;
  filename: string;
  contentType: string;
}): Record<string, unknown> {
  return {
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: sanitizeFilename(attachment.filename),
    contentType: attachment.contentType,
    contentBytes: attachment.buffer.toString("base64"),
  };
}

const DEFAULT_MESSAGE_FIELDS = [
  "id",
  "conversationId",
  "subject",
  "bodyPreview",
  "importance",
  "receivedDateTime",
  "sentDateTime",
  "hasAttachments",
  "isDraft",
  "isRead",
  "from",
  "toRecipients",
  "ccRecipients",
  "bccRecipients",
  "replyTo",
  "parentFolderId",
];

const fetchFromOutlook = async (
  endpoint: string,
  accessToken: string,
  options?: RequestInit
): Promise<Response> => {
  // eslint-disable-next-line no-restricted-globals
  return fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...options?.headers,
    },
  });
};

const getMailboxBasePath = (sharedMailboxAddress?: string): string => {
  if (sharedMailboxAddress) {
    return `/users/${encodeURIComponent(sharedMailboxAddress)}`;
  }
  return "/me";
};

// Parses the `Retry-After` header from a 429/503 response. Microsoft Graph
// typically returns a number of seconds, but per RFC 9110 the value may also
// be an HTTP-date.
const parseRetryAfterSeconds = (
  retryAfter: string | null | undefined
): number | undefined => {
  if (!retryAfter) {
    return undefined;
  }
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds);
  }
  const dateMs = Date.parse(retryAfter);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, Math.ceil((dateMs - Date.now()) / 1000));
  }
  return undefined;
};

const getErrorText = async (response: Response): Promise<string> => {
  try {
    const errorData = await response.json();
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    return errorData.error?.message || errorData.error?.code || "Unknown error";
  } catch {
    return "Unknown error";
  }
};

interface OutlookMessage {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  importance?: string;
  receivedDateTime?: string;
  sentDateTime?: string;
  hasAttachments?: boolean;
  isDraft?: boolean;
  isRead?: boolean;
  from?: {
    emailAddress: {
      address: string;
      name?: string;
    };
  };
  toRecipients?: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
  }>;
  ccRecipients?: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
  }>;
  bccRecipients?: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
  }>;
  replyTo?: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
  }>;
  body?: {
    contentType: string;
    content: string;
  };
  parentFolderId?: string;
  conversationIndex?: string;
  internetMessageId?: string;
}

interface OutlookContact {
  id: string;
  displayName?: string;
  givenName?: string;
  surname?: string;
  emailAddresses?: Array<{
    address: string;
    name?: string;
  }>;
  businessPhones?: string[];
  homePhones?: string[];
  mobilePhone?: string;
  jobTitle?: string;
  companyName?: string;
  department?: string;
  officeLocation?: string;
}

interface OutlookFileAttachment {
  "@odata.type": string;
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline?: boolean;
  contentBytes?: string; // Standard base64-encoded content
}

const OutlookFolderSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  parentFolderId: z.string().optional(),
  childFolderCount: z.number().optional(),
  unreadItemCount: z.number().optional(),
  totalItemCount: z.number().optional(),
});
type OutlookFolder = z.infer<typeof OutlookFolderSchema>;

const GraphFolderListResponseSchema = z.object({
  value: z.array(OutlookFolderSchema).default([]),
});

const foldersEndpoint = (
  basePath: string,
  parentFolderId: string | null
): string =>
  parentFolderId
    ? `${basePath}/mailFolders/${parentFolderId}/childFolders`
    : `${basePath}/mailFolders`;

const findFolderIdByName = async (
  folderName: string,
  parentFolderId: string | null,
  basePath: string,
  accessToken: string
): Promise<{ folderId: string | null } | { error: MCPError }> => {
  const response = await fetchFromOutlook(
    `${foldersEndpoint(basePath, parentFolderId)}?$top=250`,
    accessToken,
    { method: "GET" }
  );
  if (!response.ok) {
    const errorText = await getErrorText(response);
    return {
      error: new MCPError(
        `Failed to fetch folders: ${response.status} ${response.statusText} - ${errorText}`
      ),
    };
  }
  const parsed = GraphFolderListResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    return { error: new MCPError("Unexpected response format from Graph API") };
  }
  const folder = parsed.data.value.find(
    (f) => f.displayName.toLowerCase() === folderName.toLowerCase()
  );
  return { folderId: folder?.id ?? null };
};

const createFolder = async (
  displayName: string,
  parentFolderId: string | null,
  basePath: string,
  accessToken: string
): Promise<{ folderId: string } | { error: MCPError }> => {
  const response = await fetchFromOutlook(
    foldersEndpoint(basePath, parentFolderId),
    accessToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName }),
    }
  );
  if (!response.ok) {
    const errorText = await getErrorText(response);
    return {
      error: new MCPError(
        `Failed to create folder: ${response.status} ${response.statusText} - ${errorText}`
      ),
    };
  }
  const result = (await response.json()) as OutlookFolder;
  return { folderId: result.id };
};

const resolveFolderPath = async (
  folderPath: string[],
  basePath: string,
  accessToken: string
): Promise<
  { folderId: string; createdSegments: string[] } | { error: MCPError }
> => {
  let parentFolderId: string | null = null;
  const createdSegments: string[] = [];

  for (const segment of folderPath) {
    const lookup = await findFolderIdByName(
      segment,
      parentFolderId,
      basePath,
      accessToken
    );
    if ("error" in lookup) {
      return { error: lookup.error };
    }

    if (lookup.folderId) {
      parentFolderId = lookup.folderId;
      continue;
    }

    const created = await createFolder(
      segment,
      parentFolderId,
      basePath,
      accessToken
    );
    if (!("error" in created)) {
      parentFolderId = created.folderId;
      createdSegments.push(segment);
      continue;
    }

    // Create failed. This commonly happens when a concurrent move_message call
    // created the same folder between our lookup and our create (Graph returns
    // ErrorFolderExists / 409). Re-lookup; if the folder now exists, use it.
    // Otherwise the create error was a real failure — propagate it.
    const retry = await findFolderIdByName(
      segment,
      parentFolderId,
      basePath,
      accessToken
    );
    if ("error" in retry || !retry.folderId) {
      return { error: created.error };
    }
    parentFolderId = retry.folderId;
  }

  return { folderId: parentFolderId as string, createdSegments };
};

const findFolderByPath = async (
  pathSegments: string[],
  basePath: string,
  accessToken: string
): Promise<{ folderId: string } | { error: MCPError }> => {
  let parentFolderId: string | null = null;

  for (let i = 0; i < pathSegments.length; i++) {
    const segment = pathSegments[i];
    const response = await fetchFromOutlook(
      `${foldersEndpoint(basePath, parentFolderId)}?$top=250`,
      accessToken,
      { method: "GET" }
    );
    if (!response.ok) {
      const errorText = await getErrorText(response);
      return {
        error: new MCPError(
          `Failed to fetch folders: ${response.status} ${response.statusText} - ${errorText}`
        ),
      };
    }
    const parsed = GraphFolderListResponseSchema.safeParse(
      await response.json()
    );
    if (!parsed.success) {
      return {
        error: new MCPError("Unexpected response format from Graph API"),
      };
    }
    const folders = parsed.data.value;
    const folder = folders.find(
      (f) => f.displayName.toLowerCase() === segment.toLowerCase()
    );
    if (!folder) {
      const parentPath = pathSegments.slice(0, i).join("/");
      const locationHint = parentPath ? ` in "${parentPath}"` : "";
      const available = folders.map((f) => f.displayName).join(", ");
      return {
        error: new MCPError(
          `Folder "${segment}" not found${locationHint}. Available folders${locationHint}: ${available}`
        ),
      };
    }
    parentFolderId = folder.id;
  }

  if (parentFolderId === null) {
    return { error: new MCPError("No folder resolved from path") };
  }
  return { folderId: parentFolderId };
};

async function createOutlookDraft({
  basePath,
  accessToken,
  replyToMessageId,
  replyAll,
  subject,
  contentType,
  body,
  importance,
  to,
  cc,
  bcc,
  replyTo,
  sharedMailboxAddress,
  attachment,
}: {
  basePath: string;
  accessToken: string;
  replyToMessageId?: string;
  replyAll?: boolean;
  subject?: string;
  contentType?: string;
  body: string;
  importance?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string[];
  sharedMailboxAddress?: string;
  attachment: { buffer: Buffer; filename: string; contentType: string } | null;
}): Promise<Ok<{ draftId: string; conversationId?: string }> | Err<MCPError>> {
  let draftId: string;
  let conversationId: string | undefined;

  if (replyToMessageId) {
    const endpoint =
      (replyAll ?? false)
        ? `${basePath}/messages/${encodeURIComponent(replyToMessageId)}/createReplyAll`
        : `${basePath}/messages/${encodeURIComponent(replyToMessageId)}/createReply`;

    const createDraftResponse = await fetchFromOutlook(endpoint, accessToken, {
      method: "POST",
    });

    if (!createDraftResponse.ok) {
      const errorText = await getErrorText(createDraftResponse);
      if (createDraftResponse.status === 404) {
        return new Err(
          new MCPError(`Message not found: ${replyToMessageId}`, {
            tracked: false,
          })
        );
      }
      return new Err(
        new MCPError(
          `Failed to create reply draft: ${createDraftResponse.status} ${createDraftResponse.statusText} - ${errorText}`
        )
      );
    }

    const createDraftResult = await createDraftResponse.json();
    draftId = createDraftResult.id;
    conversationId = createDraftResult.conversationId;

    const existingBody = createDraftResult.body?.content ?? "";
    const sanitizedBody = sanitizeHtml(body);
    const combinedBody = `<div>${sanitizedBody}</div><br><br>${existingBody}`;

    const updatePayload: Record<string, unknown> = {
      body: { contentType: "html", content: combinedBody },
      importance,
    };
    if (to && to.length > 0) {
      updatePayload.toRecipients = to.map((email) => ({
        emailAddress: { address: email },
      }));
    }
    if (cc && cc.length > 0) {
      updatePayload.ccRecipients = cc.map((email) => ({
        emailAddress: { address: email },
      }));
    }
    if (bcc && bcc.length > 0) {
      updatePayload.bccRecipients = bcc.map((email) => ({
        emailAddress: { address: email },
      }));
    }
    if (replyTo && replyTo.length > 0) {
      updatePayload.replyTo = replyTo.map((email) => ({
        emailAddress: { address: email },
      }));
    }

    const encodedDraftId = encodeURIComponent(draftId);

    const updateDraftResponse = await fetchFromOutlook(
      `${basePath}/messages/${encodedDraftId}`,
      accessToken,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
      }
    );

    if (!updateDraftResponse.ok) {
      void fetchFromOutlook(
        `${basePath}/messages/${encodedDraftId}`,
        accessToken,
        { method: "DELETE" }
      );
      const errorText = await getErrorText(updateDraftResponse);
      return new Err(
        new MCPError(`Failed to update reply draft: ${errorText}`)
      );
    }
  } else {
    const message: Record<string, unknown> = {
      subject,
      importance,
      body: { contentType, content: body },
      toRecipients: (to ?? []).map((email) => ({
        emailAddress: { address: email },
      })),
      isDraft: true,
    };

    if (sharedMailboxAddress) {
      message.from = { emailAddress: { address: sharedMailboxAddress } };
    }
    if (cc && cc.length > 0) {
      message.ccRecipients = cc.map((email) => ({
        emailAddress: { address: email },
      }));
    }
    if (bcc && bcc.length > 0) {
      message.bccRecipients = bcc.map((email) => ({
        emailAddress: { address: email },
      }));
    }
    if (replyTo && replyTo.length > 0) {
      message.replyTo = replyTo.map((email) => ({
        emailAddress: { address: email },
      }));
    }

    const response = await fetchFromOutlook(
      `${basePath}/messages`,
      accessToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      }
    );

    if (!response.ok) {
      const errorText = await getErrorText(response);
      return new Err(new MCPError(`Failed to create draft: ${errorText}`));
    }

    const result = await response.json();
    draftId = result.id;
    conversationId = result.conversationId;
  }

  if (attachment) {
    const encodedDraftId = encodeURIComponent(draftId);
    const attachmentResponse = await fetchFromOutlook(
      `${basePath}/messages/${encodedDraftId}/attachments`,
      accessToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildFileAttachmentPayload(attachment)),
      }
    );

    if (!attachmentResponse.ok) {
      void fetchFromOutlook(
        `${basePath}/messages/${encodedDraftId}`,
        accessToken,
        { method: "DELETE" }
      );
      const errorText = await getErrorText(attachmentResponse);
      return new Err(new MCPError(`Failed to add attachment: ${errorText}`));
    }
  }

  return new Ok({ draftId, conversationId });
}

async function sendDirectMail({
  basePath,
  accessToken,
  to,
  cc,
  bcc,
  replyTo,
  subject,
  contentType,
  body,
  importance,
  saveToSentItems,
  sharedMailboxAddress,
  attachment,
}: {
  basePath: string;
  accessToken: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string[];
  subject?: string;
  contentType?: string;
  body: string;
  importance?: string;
  saveToSentItems: boolean;
  sharedMailboxAddress?: string;
  attachment: { buffer: Buffer; filename: string; contentType: string } | null;
}): Promise<Ok<null> | Err<MCPError>> {
  const message: Record<string, unknown> = {
    subject,
    importance,
    body: { contentType: contentType ?? "text", content: body },
    toRecipients: (to ?? []).map((email) => ({
      emailAddress: { address: email },
    })),
  };
  if (sharedMailboxAddress) {
    message.from = { emailAddress: { address: sharedMailboxAddress } };
  }
  if (cc && cc.length > 0) {
    message.ccRecipients = cc.map((email) => ({
      emailAddress: { address: email },
    }));
  }
  if (bcc && bcc.length > 0) {
    message.bccRecipients = bcc.map((email) => ({
      emailAddress: { address: email },
    }));
  }
  if (replyTo && replyTo.length > 0) {
    message.replyTo = replyTo.map((email) => ({
      emailAddress: { address: email },
    }));
  }
  if (attachment) {
    message.attachments = [buildFileAttachmentPayload(attachment)];
  }

  const response = await fetchFromOutlook(`${basePath}/sendMail`, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, saveToSentItems }),
  });

  if (!response.ok) {
    const errorText = await getErrorText(response);
    return new Err(
      new MCPError(
        `Failed to send email: ${response.status} ${response.statusText} - ${errorText}`
      )
    );
  }

  return new Ok(null);
}

async function sendReply({
  basePath,
  accessToken,
  replyToMessageId,
  replyAll,
  body,
  importance,
  to,
  cc,
  bcc,
  replyTo,
}: {
  basePath: string;
  accessToken: string;
  replyToMessageId: string;
  replyAll?: boolean;
  body: string;
  importance?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string[];
}): Promise<Ok<null> | Err<MCPError>> {
  const endpoint =
    (replyAll ?? false)
      ? `${basePath}/messages/${encodeURIComponent(replyToMessageId)}/replyAll`
      : `${basePath}/messages/${encodeURIComponent(replyToMessageId)}/reply`;

  const message: Record<string, unknown> = {
    body: { contentType: "html", content: sanitizeHtml(body) },
    importance,
  };
  if (to && to.length > 0) {
    message.toRecipients = to.map((email) => ({
      emailAddress: { address: email },
    }));
  }
  if (cc && cc.length > 0) {
    message.ccRecipients = cc.map((email) => ({
      emailAddress: { address: email },
    }));
  }
  if (bcc && bcc.length > 0) {
    message.bccRecipients = bcc.map((email) => ({
      emailAddress: { address: email },
    }));
  }
  if (replyTo && replyTo.length > 0) {
    message.replyTo = replyTo.map((email) => ({
      emailAddress: { address: email },
    }));
  }

  const response = await fetchFromOutlook(endpoint, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    const errorText = await getErrorText(response);
    if (response.status === 404) {
      return new Err(
        new MCPError(`Message not found: ${replyToMessageId}`, {
          tracked: false,
        })
      );
    }
    return new Err(
      new MCPError(
        `Failed to send reply: ${response.status} ${response.statusText} - ${errorText}`
      )
    );
  }

  return new Ok(null);
}

function validateMailParams({
  replyToMessageId,
  subject,
  contentType,
  to,
}: {
  replyToMessageId?: string;
  subject?: string;
  contentType?: string;
  to?: string[];
}): Err<MCPError> | null {
  if (replyToMessageId) {
    if (subject) {
      return new Err(
        new MCPError("subject must be omitted when replyToMessageId is set.")
      );
    }
    if (contentType) {
      return new Err(
        new MCPError(
          "contentType must be omitted when replyToMessageId is set."
        )
      );
    }
  } else {
    if (!to || to.length === 0) {
      return new Err(
        new MCPError(
          "At least one recipient is required when replyToMessageId is not set."
        )
      );
    }
    if (!subject?.trim()) {
      return new Err(
        new MCPError("subject is required when replyToMessageId is not set.")
      );
    }
    if (!contentType) {
      return new Err(
        new MCPError(
          "contentType is required when replyToMessageId is not set."
        )
      );
    }
  }
  return null;
}

const handlers: ToolHandlers<typeof OUTLOOK_TOOLS_METADATA> = {
  get_messages: async (
    { search, folderName, top = 10, skip = 0, select, sharedMailboxAddress },
    { authInfo, auth, agentLoopContext }
  ) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }

    const basePath = getMailboxBasePath(sharedMailboxAddress);

    // If folderName is provided, resolve it (supports "/" separated paths like "Inbox/Projects")
    let folderId: string | undefined;
    if (folderName) {
      const pathSegments = folderName
        .split("/")
        .map((s) => s.trim())
        .filter(Boolean);
      const resolved = await findFolderByPath(
        pathSegments,
        basePath,
        accessToken
      );
      if ("error" in resolved) {
        return new Err(resolved.error);
      }
      folderId = resolved.folderId;
    }

    const allowedLabels = await getAllowedLabelsForMCPServer(
      auth,
      agentLoopContext
    );

    if (allowedLabels.length > 0) {
      // Two parallel requests:
      // 1. /search/query with KQL to get messages that have an allowed label.
      // 2. Regular messages endpoint expanded with the MIP MAPI property
      //    (msip_labels). Messages where singleValueExtendedProperties is absent
      //    have no sensitivity label and are safe to include.
      // Results are merged and deduplicated by id.
      const MIP_EXTENDED_PROP =
        "String {00020386-0000-0000-C000-000000000046} Name msip_labels";

      const labelQueryParts = allowedLabels.map(
        (label) => `InformationProtectionLabelId:${label}`
      );
      const labelKql = labelQueryParts.join(" OR ");
      const labeledQueryString = search
        ? `(${search}) AND (${labelKql})`
        : labelKql;

      const searchRequest: Record<string, unknown> = {
        entityTypes: ["message"],
        query: { queryString: labeledQueryString },
        from: skip,
        size: Math.min(top, 100),
        fields: select && select.length > 0 ? select : DEFAULT_MESSAGE_FIELDS,
      };
      if (sharedMailboxAddress) {
        searchRequest.contentSources = [
          `/users/${encodeURIComponent(sharedMailboxAddress)}/messages`,
        ];
      }

      // Build the unlabeled messages request using the regular messages endpoint.
      const unlabeledParams = new URLSearchParams();
      // Over-fetch to compensate for labeled messages that will be filtered out client-side.
      unlabeledParams.append("$top", Math.min(top * 2, 100).toString());
      unlabeledParams.append("$skip", skip.toString());
      unlabeledParams.append(
        "$expand",
        `singleValueExtendedProperties($filter=id eq '${MIP_EXTENDED_PROP}')`
      );
      if (search) {
        unlabeledParams.append("$search", `"${search}"`);
      }
      if (select && select.length > 0) {
        unlabeledParams.append("$select", select.join(","));
      } else {
        unlabeledParams.append("$select", DEFAULT_MESSAGE_FIELDS.join(","));
      }
      const unlabeledEndpoint = folderId
        ? `${basePath}/mailFolders/${folderId}/messages?${unlabeledParams.toString()}`
        : `${basePath}/messages?${unlabeledParams.toString()}`;

      const [labeledResponse, unlabeledResponse] = await Promise.all([
        fetchFromOutlook("/search/query", accessToken, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests: [searchRequest] }),
        }),
        fetchFromOutlook(unlabeledEndpoint, accessToken, { method: "GET" }),
      ]);

      if (!labeledResponse.ok) {
        const errorText = await getErrorText(labeledResponse);
        return new Err(
          new MCPError(
            `Failed to get messages: ${labeledResponse.status} ${labeledResponse.statusText} - ${errorText}`
          )
        );
      }
      if (!unlabeledResponse.ok) {
        const errorText = await getErrorText(unlabeledResponse);
        return new Err(
          new MCPError(
            `Failed to get messages: ${unlabeledResponse.status} ${unlabeledResponse.statusText} - ${errorText}`
          )
        );
      }

      const [labeledResult, unlabeledResult] = await Promise.all([
        labeledResponse.json(),
        unlabeledResponse.json(),
      ]);

      const labeledHits: Array<{ hitId: string; resource: OutlookMessage }> =
        labeledResult?.value?.[0]?.hitsContainers?.[0]?.hits ?? [];
      const allUnlabeled: Array<
        OutlookMessage & {
          singleValueExtendedProperties?: unknown[];
        }
      > = unlabeledResult?.value ?? [];
      const unlabeledMessages = allUnlabeled.filter(
        (m) =>
          !m.singleValueExtendedProperties ||
          m.singleValueExtendedProperties.length === 0
      );

      const messages: OutlookMessage[] = [
        ...labeledHits.map((hit) => ({ ...hit.resource, id: hit.hitId })),
        ...unlabeledMessages,
      ]
        .sort((a, b) => {
          const aTime = a.sentDateTime ? new Date(a.sentDateTime).getTime() : 0;
          const bTime = b.sentDateTime ? new Date(b.sentDateTime).getTime() : 0;
          return bTime - aTime;
        })
        .slice(0, top);

      const labeledContainer =
        labeledResult?.value?.[0]?.hitsContainers?.[0] ?? {};

      return new Ok([
        { type: "text" as const, text: "Messages fetched successfully" },
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              messages,
              totalCount:
                (labeledContainer.total ?? 0) +
                (unlabeledResult?.["@odata.count"] ?? 0),
              moreResultsAvailable:
                labeledContainer.moreResultsAvailable ||
                !!unlabeledResult?.["@odata.nextLink"],
            },
            null,
            2
          ),
        },
      ]);
    }

    // Standard path: no sensitivity label filter configured.
    const params = new URLSearchParams();
    params.append("$top", Math.min(top, 100).toString());

    if (search) {
      params.append("$search", `"${search}"`);
    } else {
      params.append("$skip", skip.toString());
    }

    if (select && select.length > 0) {
      params.append("$select", select.join(","));
    } else {
      params.append("$select", DEFAULT_MESSAGE_FIELDS.join(","));
    }

    // Use different endpoint if folderId is provided
    const endpoint = folderId
      ? `${basePath}/mailFolders/${folderId}/messages?${params.toString()}`
      : `${basePath}/messages?${params.toString()}`;

    const response = await fetchFromOutlook(endpoint, accessToken, {
      method: "GET",
    });

    if (!response.ok) {
      const errorText = await getErrorText(response);
      return new Err(
        new MCPError(
          `Failed to get messages: ${response.status} ${response.statusText} - ${errorText}`
        )
      );
    }

    const result = await response.json();

    return new Ok([
      { type: "text" as const, text: "Messages fetched successfully" },
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            messages: (result.value || []) as OutlookMessage[],
            nextLink: result["@odata.nextLink"],
            totalCount: result["@odata.count"],
          },
          null,
          2
        ),
      },
    ]);
  },

  list_folders: async ({ folderPath, sharedMailboxAddress }, { authInfo }) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }

    const basePath = getMailboxBasePath(sharedMailboxAddress);
    let parentFolderId: string | null = null;

    if (folderPath && folderPath.length > 0) {
      const resolved = await findFolderByPath(
        folderPath,
        basePath,
        accessToken
      );
      if ("error" in resolved) {
        return new Err(resolved.error);
      }
      parentFolderId = resolved.folderId;
    }

    const response = await fetchFromOutlook(
      `${foldersEndpoint(basePath, parentFolderId)}?$top=250`,
      accessToken,
      { method: "GET" }
    );

    if (!response.ok) {
      const errorText = await getErrorText(response);
      return new Err(
        new MCPError(
          `Failed to fetch folders: ${response.status} ${response.statusText} - ${errorText}`
        )
      );
    }

    const parsed = GraphFolderListResponseSchema.safeParse(
      await response.json()
    );
    if (!parsed.success) {
      return new Err(new MCPError("Unexpected response format from Graph API"));
    }
    const folders = parsed.data.value;

    const path = folderPath ?? [];
    return new Ok([
      {
        type: "resource" as const,
        resource: {
          mimeType: OUTLOOK_MAIL_FOLDER_LIST_MIME_TYPE,
          uri: "",
          text: `${folders.length} folder(s) listed${path.length > 0 ? ` in "${path.join("/")}"` : ""}`,
          path,
          folders: folders.map((f) => ({
            name: f.displayName,
            childFolderCount: f.childFolderCount,
            unreadItemCount: f.unreadItemCount,
            totalItemCount: f.totalItemCount,
          })),
        },
      },
    ]);
  },

  get_attachments: async (
    { messageId, sharedMailboxAddress },
    { authInfo }
  ) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }

    const basePath = getMailboxBasePath(sharedMailboxAddress);
    const encodedMessageId = encodeURIComponent(messageId);

    // List all attachments for the message
    const listResponse = await fetchFromOutlook(
      `${basePath}/messages/${encodedMessageId}/attachments`,
      accessToken,
      { method: "GET" }
    );

    if (!listResponse.ok) {
      const errorText = await getErrorText(listResponse);
      if (listResponse.status === 404) {
        return new Err(
          new MCPError(`Message not found: ${messageId}`, { tracked: false })
        );
      }
      return new Err(
        new MCPError(
          `Failed to list attachments: ${listResponse.status} ${listResponse.statusText} - ${errorText}`
        )
      );
    }

    const listResult = await listResponse.json();
    const attachments = (listResult.value ?? []) as OutlookFileAttachment[];

    // Filter to file attachments only (skip itemAttachment, referenceAttachment)
    const fileAttachments = attachments.filter(
      (a) => a["@odata.type"] === "#microsoft.graph.fileAttachment"
    );

    if (fileAttachments.length === 0) {
      return new Ok([
        {
          type: "text" as const,
          text: "No file attachments found on this message.",
        },
      ]);
    }

    // Process each file attachment concurrently
    const results = await concurrentExecutor(
      fileAttachments,
      async (
        attachment
      ): Promise<{
        filename: string;
        content: CallToolResult["content"];
        error?: string;
      }> => {
        const filename = attachment.name || "unnamed";
        const mimeType = attachment.contentType || "application/octet-stream";

        if (!attachment.contentBytes) {
          return { filename, content: [], error: "No content available" };
        }

        const buffer = Buffer.from(attachment.contentBytes, "base64");

        const result = await processAttachment({
          mimeType,
          filename,
          extractText: async () => extractTextFromBuffer(buffer, mimeType),
          downloadContent: async () => new Ok(buffer),
        });

        if (result.isErr()) {
          return { filename, content: [], error: result.error.message };
        }

        // Ensure a resource block is included so the file can be used by other tools
        const hasResource = result.value.some((c) => c.type === "resource");
        if (!hasResource) {
          result.value.push({
            type: "resource" as const,
            resource: {
              blob: attachment.contentBytes,
              _meta: { text: `Attachment: ${sanitizeFilename(filename)}` },
              mimeType,
              uri: sanitizeFilename(filename),
            },
          });
        }

        return { filename, content: result.value };
      },
      { concurrency: 5 }
    );

    // Aggregate all content blocks
    const allContent: CallToolResult["content"] = [
      {
        type: "text" as const,
        text: `Found ${fileAttachments.length} attachment(s).`,
      },
    ];

    for (const r of results) {
      if (r.error) {
        allContent.push({
          type: "text" as const,
          text: `Failed to process "${r.filename}": ${r.error}`,
        });
      } else {
        allContent.push(...r.content);
      }
    }

    return new Ok(allContent);
  },

  get_drafts: async (
    { search, top = 10, skip = 0, sharedMailboxAddress },
    { authInfo }
  ) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }

    const basePath = getMailboxBasePath(sharedMailboxAddress);

    const params = new URLSearchParams();
    params.append("$filter", "isDraft eq true");
    params.append("$top", Math.min(top, 100).toString());

    if (search) {
      params.append("$search", `"${search}"`);
    } else {
      params.append("$skip", skip.toString());
    }

    const response = await fetchFromOutlook(
      `${basePath}/messages?${params.toString()}`,
      accessToken,
      { method: "GET" }
    );

    if (!response.ok) {
      return new Err(new MCPError("Failed to get drafts"));
    }

    const result = await response.json();

    // Get detailed information for each draft
    const draftDetails = await concurrentExecutor(
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      result.value || [],
      async (draft: { id: string }): Promise<OutlookMessage | null> => {
        const draftResponse = await fetchFromOutlook(
          `${basePath}/messages/${draft.id}`,
          accessToken,
          { method: "GET" }
        );

        if (!draftResponse.ok) {
          return null;
        }

        return draftResponse.json();
      },
      { concurrency: 10 }
    );

    return new Ok([
      { type: "text" as const, text: "Drafts fetched successfully" },
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            drafts: draftDetails.filter(Boolean) as OutlookMessage[],
            nextLink: result["@odata.nextLink"],
          },
          null,
          2
        ),
      },
    ]);
  },

  create_draft: async (
    {
      to,
      cc,
      bcc,
      replyTo,
      subject,
      contentType,
      body,
      importance = "normal",
      replyToMessageId,
      replyAll = false,
      sharedMailboxAddress,
      attachmentFilePath,
    },
    { authInfo, auth, agentLoopContext }
  ) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }

    const attachmentResult = await fetchAttachment(
      auth,
      attachmentFilePath,
      agentLoopContext
    );
    if (attachmentResult.isErr()) {
      return attachmentResult;
    }
    const attachment = attachmentResult.value;

    const validationError = validateMailParams({
      replyToMessageId,
      subject,
      contentType,
      to,
    });
    if (validationError) {
      return validationError;
    }

    const basePath = getMailboxBasePath(sharedMailboxAddress);

    const result = await createOutlookDraft({
      basePath,
      accessToken,
      replyToMessageId,
      replyAll,
      subject,
      contentType,
      body,
      importance,
      to,
      cc,
      bcc,
      replyTo,
      sharedMailboxAddress,
      attachment,
    });
    if (result.isErr()) {
      return result;
    }

    return new Ok([
      { type: "text" as const, text: "Draft created successfully" },
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            messageId: result.value.draftId,
            conversationId: result.value.conversationId,
          },
          null,
          2
        ),
      },
    ]);
  },

  delete_draft: async (
    { messageId, subject, to, sharedMailboxAddress },
    { authInfo }
  ) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }

    // Subject and to are required for user display/confirmation
    if (!subject || to.length === 0) {
      return new Err(
        new MCPError("Subject and recipients are required for confirmation")
      );
    }

    const basePath = getMailboxBasePath(sharedMailboxAddress);

    const response = await fetchFromOutlook(
      `${basePath}/messages/${messageId}`,
      accessToken,
      { method: "DELETE" }
    );

    if (!response.ok) {
      return new Err(new MCPError("Failed to delete draft"));
    }

    return new Ok([
      { type: "text" as const, text: "Draft deleted successfully" },
    ]);
  },

  send_mail: async (
    {
      to,
      cc,
      bcc,
      replyTo,
      subject,
      contentType,
      body,
      importance,
      saveToSentItems = true,
      sharedMailboxAddress,
      replyToMessageId,
      replyAll = false,
      attachmentFilePath,
    },
    { authInfo, auth, agentLoopContext }
  ) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }

    const validationError = validateMailParams({
      replyToMessageId,
      subject,
      contentType,
      to,
    });
    if (validationError) {
      return validationError;
    }

    const attachmentResult = await fetchAttachment(
      auth,
      attachmentFilePath,
      agentLoopContext
    );
    if (attachmentResult.isErr()) {
      return attachmentResult;
    }
    const attachment = attachmentResult.value;

    const basePath = getMailboxBasePath(sharedMailboxAddress);

    if (!replyToMessageId) {
      const result = await sendDirectMail({
        basePath,
        accessToken,
        to,
        cc,
        bcc,
        replyTo,
        subject,
        contentType,
        body,
        importance,
        saveToSentItems,
        sharedMailboxAddress,
        attachment,
      });
      if (result.isErr()) {
        return result;
      }
      return new Ok([
        { type: "text" as const, text: "Email sent successfully" },
      ]);
    }

    // Reply with an attachment: the /reply endpoint doesn't support inline
    // attachments, so create a reply draft (with the attachment) then send it.
    if (attachment) {
      const draftResult = await createOutlookDraft({
        basePath,
        accessToken,
        replyToMessageId,
        replyAll,
        body,
        importance,
        to,
        cc,
        bcc,
        replyTo,
        sharedMailboxAddress,
        attachment,
      });
      if (draftResult.isErr()) {
        return draftResult;
      }
      const { draftId } = draftResult.value;
      const encodedDraftId = encodeURIComponent(draftId);

      const sendResponse = await fetchFromOutlook(
        `${basePath}/messages/${encodedDraftId}/send`,
        accessToken,
        { method: "POST" }
      );

      if (!sendResponse.ok) {
        void fetchFromOutlook(
          `${basePath}/messages/${encodedDraftId}`,
          accessToken,
          { method: "DELETE" }
        );
        const errorText = await getErrorText(sendResponse);
        return new Err(
          new MCPError(
            `Failed to send email: ${sendResponse.status} ${sendResponse.statusText} - ${errorText}`
          )
        );
      }

      return new Ok([
        { type: "text" as const, text: "Email sent successfully" },
      ]);
    }

    // Reply without an attachment: use the /reply endpoint directly (single call).
    const result = await sendReply({
      basePath,
      accessToken,
      replyToMessageId,
      replyAll,
      body,
      importance,
      to,
      cc,
      bcc,
      replyTo,
    });
    if (result.isErr()) {
      return result;
    }
    return new Ok([{ type: "text" as const, text: "Email sent successfully" }]);
  },

  move_messages: async (
    { messageIds, destinationFolderPath, sharedMailboxAddress },
    { authInfo }
  ) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }

    const basePath = getMailboxBasePath(sharedMailboxAddress);

    const resolved = await resolveFolderPath(
      destinationFolderPath,
      basePath,
      accessToken
    );
    if ("error" in resolved) {
      return new Err(resolved.error);
    }

    const moveResults = await concurrentExecutor(
      messageIds,
      async (
        messageId
      ): Promise<
        | { messageId: string; ok: true; newMessageId: string }
        | {
            messageId: string;
            ok: false;
            error: string;
            retryAfterSeconds?: number;
          }
      > => {
        const encodedMessageId = encodeURIComponent(messageId);
        const response = await fetchFromOutlook(
          `${basePath}/messages/${encodedMessageId}/move`,
          accessToken,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ destinationId: resolved.folderId }),
          }
        );

        if (!response.ok) {
          const errorText = await getErrorText(response);
          const error =
            response.status === 404
              ? "Message not found"
              : `${response.status} ${response.statusText} - ${errorText}`;
          const retryAfterSeconds =
            response.status === 429 || response.status === 503
              ? parseRetryAfterSeconds(response.headers.get("Retry-After"))
              : undefined;
          return retryAfterSeconds !== undefined
            ? { messageId, ok: false, error, retryAfterSeconds }
            : { messageId, ok: false, error };
        }

        const result = await response.json();
        return { messageId, ok: true, newMessageId: result.id };
      },
      { concurrency: 3 }
    );

    const succeeded = moveResults.filter((r) => r.ok);
    const failed = moveResults.filter((r) => !r.ok);
    const throttled = failed.filter((r) => r.retryAfterSeconds !== undefined);
    const maxRetryAfterSeconds = throttled.reduce(
      (max, r) => Math.max(max, r.retryAfterSeconds ?? 0),
      0
    );
    const pathLabel = destinationFolderPath.join(" / ");

    const summaryParts: string[] = [];
    summaryParts.push(
      `Moved ${succeeded.length}/${messageIds.length} message(s) to "${pathLabel}".`
    );
    if (resolved.createdSegments.length > 0) {
      summaryParts.push(
        `New folder segments created: ${resolved.createdSegments.join(", ")}.`
      );
    }
    if (failed.length > 0) {
      summaryParts.push(`${failed.length} failed.`);
    }
    if (throttled.length > 0) {
      summaryParts.push(
        `${throttled.length} throttled by Microsoft Graph — retry after ${maxRetryAfterSeconds} second(s).`
      );
    }

    return new Ok([
      { type: "text" as const, text: summaryParts.join(" ") },
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            destinationFolderPath,
            createdSegments: resolved.createdSegments,
            succeeded,
            failed,
          },
          null,
          2
        ),
      },
    ]);
  },

  get_message_body: async (
    {
      messageId,
      preferredContentType = "text",
      startChar = 0,
      endChar,
      sharedMailboxAddress,
    },
    { authInfo }
  ) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }

    const basePath = getMailboxBasePath(sharedMailboxAddress);
    const encodedId = encodeURIComponent(messageId);

    const params = new URLSearchParams();
    params.append("$select", "id,subject,from,receivedDateTime,body");

    const fetchHeaders: Record<string, string> = {};
    if (preferredContentType === "text") {
      fetchHeaders["Prefer"] = 'outlook.body-content-type="text"';
    }

    const response = await fetchFromOutlook(
      `${basePath}/messages/${encodedId}?${params.toString()}`,
      accessToken,
      { method: "GET", headers: fetchHeaders }
    );

    if (!response.ok) {
      const errorText = await getErrorText(response);
      if (response.status === 404) {
        return new Err(
          new MCPError(`Message not found: ${messageId}`, { tracked: false })
        );
      }
      return new Err(
        new MCPError(
          `Failed to get message body: ${response.status} ${response.statusText} - ${errorText}`
        )
      );
    }

    const message = (await response.json()) as OutlookMessage;
    const rawBody = message.body?.content ?? "";
    const actualContentType = message.body?.contentType ?? preferredContentType;
    const totalLength = rawBody.length;

    const MAX_CHUNK = 50_000;
    const chunkEnd = Math.min(
      endChar !== undefined ? endChar : startChar + MAX_CHUNK,
      totalLength
    );
    const bodySlice = rawBody.slice(startChar, chunkEnd);
    const moreAvailable = chunkEnd < totalLength;

    return new Ok([
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            messageId: message.id,
            subject: message.subject,
            from: message.from,
            receivedDateTime: message.receivedDateTime,
            contentType: actualContentType,
            bodyLength: totalLength,
            startChar,
            endChar: chunkEnd,
            moreAvailable,
            body: bodySlice,
          },
          null,
          2
        ),
      },
    ]);
  },

  get_contacts: async (
    { search, top = 20, skip = 0, select },
    { authInfo }
  ) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }

    const params = new URLSearchParams();
    params.append("$top", Math.min(top, 100).toString());

    if (search) {
      params.append("$search", `"${search}"`);
    } else {
      params.append("$skip", skip.toString());
    }

    if (select && select.length > 0) {
      params.append("$select", select.join(","));
    } else {
      params.append(
        "$select",
        "id,displayName,givenName,surname,emailAddresses,businessPhones,homePhones,mobilePhone,jobTitle,companyName,department,officeLocation"
      );
    }

    const response = await fetchFromOutlook(
      `/me/contacts?${params.toString()}`,
      accessToken,
      { method: "GET" }
    );

    if (!response.ok) {
      const errorText = await getErrorText(response);
      return new Err(
        new MCPError(
          `Failed to get contacts: ${response.status} ${response.statusText} - ${errorText}`
        )
      );
    }

    const result = await response.json();

    return new Ok([
      { type: "text" as const, text: "Contacts fetched successfully" },
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            contacts: (result.value || []) as OutlookContact[],
            nextLink: result["@odata.nextLink"],
            totalCount: result["@odata.count"],
          },
          null,
          2
        ),
      },
    ]);
  },

  create_contact: async (
    {
      displayName,
      givenName,
      surname,
      emailAddresses,
      businessPhones,
      homePhones,
      mobilePhone,
      jobTitle,
      companyName,
      department,
      officeLocation,
    },
    { authInfo }
  ) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }

    const contact: Record<string, unknown> = {
      displayName,
    };

    if (givenName) {
      contact.givenName = givenName;
    }
    if (surname) {
      contact.surname = surname;
    }
    if (emailAddresses) {
      contact.emailAddresses = emailAddresses;
    }
    if (businessPhones) {
      contact.businessPhones = businessPhones;
    }
    if (homePhones) {
      contact.homePhones = homePhones;
    }
    if (mobilePhone) {
      contact.mobilePhone = mobilePhone;
    }
    if (jobTitle) {
      contact.jobTitle = jobTitle;
    }
    if (companyName) {
      contact.companyName = companyName;
    }
    if (department) {
      contact.department = department;
    }
    if (officeLocation) {
      contact.officeLocation = officeLocation;
    }

    const response = await fetchFromOutlook("/me/contacts", accessToken, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(contact),
    });

    if (!response.ok) {
      const errorText = await getErrorText(response);
      return new Err(
        new MCPError(
          `Failed to create contact: ${response.status} ${response.statusText} - ${errorText}`
        )
      );
    }

    const result = await response.json();

    return new Ok([
      { type: "text" as const, text: "Contact created successfully" },
      {
        type: "text" as const,
        text: JSON.stringify(result as OutlookContact, null, 2),
      },
    ]);
  },

  update_contact: async (
    {
      contactId,
      displayName,
      givenName,
      surname,
      emailAddresses,
      businessPhones,
      homePhones,
      mobilePhone,
      jobTitle,
      companyName,
      department,
      officeLocation,
    },
    { authInfo }
  ) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }

    const contact: Record<string, unknown> = {};

    if (displayName) {
      contact.displayName = displayName;
    }
    if (givenName) {
      contact.givenName = givenName;
    }
    if (surname) {
      contact.surname = surname;
    }
    if (emailAddresses) {
      contact.emailAddresses = emailAddresses;
    }
    if (businessPhones) {
      contact.businessPhones = businessPhones;
    }
    if (homePhones) {
      contact.homePhones = homePhones;
    }
    if (mobilePhone) {
      contact.mobilePhone = mobilePhone;
    }
    if (jobTitle) {
      contact.jobTitle = jobTitle;
    }
    if (companyName) {
      contact.companyName = companyName;
    }
    if (department) {
      contact.department = department;
    }
    if (officeLocation) {
      contact.officeLocation = officeLocation;
    }

    const response = await fetchFromOutlook(
      `/me/contacts/${contactId}`,
      accessToken,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(contact),
      }
    );

    if (!response.ok) {
      const errorText = await getErrorText(response);
      if (response.status === 404) {
        return new Err(
          new MCPError(`Contact not found: ${contactId}`, {
            tracked: false,
          })
        );
      }
      return new Err(
        new MCPError(
          `Failed to update contact: ${response.status} ${response.statusText} - ${errorText}`
        )
      );
    }

    const result = await response.json();

    return new Ok([
      { type: "text" as const, text: "Contact updated successfully" },
      {
        type: "text" as const,
        text: JSON.stringify(result as OutlookContact, null, 2),
      },
    ]);
  },
};

export const TOOLS = buildTools(OUTLOOK_TOOLS_METADATA, handlers);
