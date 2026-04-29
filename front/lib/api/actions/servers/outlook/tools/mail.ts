import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  extractTextFromBuffer,
  processAttachment,
} from "@app/lib/actions/mcp_internal_actions/utils/attachment_processing";
import { sanitizeFilename } from "@app/lib/actions/mcp_internal_actions/utils/file_utils";
import { getAllowedLabelsForMCPServer } from "@app/lib/api/actions/servers/microsoft/utils";
import { OUTLOOK_TOOLS_METADATA } from "@app/lib/api/actions/servers/outlook/mail_metadata";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { Err, Ok } from "@app/types/shared/result";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import sanitizeHtml from "sanitize-html";

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

interface OutlookFolder {
  id: string;
  displayName: string;
  parentFolderId?: string;
  childFolderCount?: number;
  unreadItemCount?: number;
  totalItemCount?: number;
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

    // If folderName is provided, search for the folder and get its ID
    let folderId: string | undefined;
    if (folderName) {
      const foldersResponse = await fetchFromOutlook(
        `${basePath}/mailFolders`,
        accessToken,
        {
          method: "GET",
        }
      );

      if (!foldersResponse.ok) {
        const errorText = await getErrorText(foldersResponse);
        return new Err(
          new MCPError(
            `Failed to fetch folders: ${foldersResponse.status} ${foldersResponse.statusText} - ${errorText}`
          )
        );
      }

      const foldersResult = await foldersResponse.json();
      const folders = (foldersResult.value ?? []) as OutlookFolder[];

      // Search for the folder by name (case-insensitive)
      const folder = folders.find(
        (f) => f.displayName.toLowerCase() === folderName.toLowerCase()
      );

      if (!folder) {
        return new Err(
          new MCPError(
            `Folder "${folderName}" not found. Available folders: ${folders.map((f) => f.displayName).join(", ")}`
          )
        );
      }

      folderId = folder.id;
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

      const defaultSearchFields = [
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

      const searchRequest: Record<string, unknown> = {
        entityTypes: ["message"],
        query: { queryString: labeledQueryString },
        from: skip,
        size: Math.min(top, 100),
        fields: select && select.length > 0 ? select : defaultSearchFields,
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
        unlabeledParams.append(
          "$select",
          "id,conversationId,subject,bodyPreview,importance,receivedDateTime,sentDateTime,hasAttachments,isDraft,isRead,from,toRecipients,ccRecipients,bccRecipients,replyTo,parentFolderId"
        );
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
      params.append(
        "$select",
        "id,conversationId,subject,bodyPreview,importance,receivedDateTime,sentDateTime,hasAttachments,isDraft,isRead,from,toRecipients,ccRecipients,bccRecipients,replyTo,parentFolderId"
      );
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
    { to, cc, bcc, replyTo, subject, contentType, body, importance = "normal" },
    { authInfo }
  ) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }

    // Create the email message object for Microsoft Graph API
    const message: Record<string, unknown> = {
      subject,
      importance,
      body: {
        contentType,
        content: body,
      },
      toRecipients: to.map((email) => ({
        emailAddress: { address: email },
      })),
      isDraft: true,
    };

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

    // Make the API call to create the draft in Outlook
    const response = await fetchFromOutlook("/me/messages", accessToken, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errorText = await getErrorText(response);
      return new Err(new MCPError(`Failed to create draft: ${errorText}`));
    }

    const result = await response.json();

    return new Ok([
      { type: "text" as const, text: "Draft created successfully" },
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            messageId: result.id,
            conversationId: result.conversationId,
          },
          null,
          2
        ),
      },
    ]);
  },

  delete_draft: async ({ messageId, subject, to }, { authInfo }) => {
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

    const response = await fetchFromOutlook(
      `/me/messages/${messageId}`,
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

  create_reply_draft: async (
    { messageId, body, contentType = "html", replyAll = false, to, cc, bcc },
    { authInfo }
  ) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }

    // Create the reply draft
    const endpoint = replyAll
      ? `/me/messages/${messageId}/createReplyAll`
      : `/me/messages/${messageId}/createReply`;

    const replyMessage: Record<string, unknown> = {
      message: {
        body: {
          contentType,
          content: body,
        },
      },
    };

    // Add recipients if overriding
    if (to && to.length > 0) {
      (replyMessage.message as Record<string, unknown>).toRecipients = to.map(
        (email) => ({
          emailAddress: { address: email },
        })
      );
    }

    if (cc && cc.length > 0) {
      (replyMessage.message as Record<string, unknown>).ccRecipients = cc.map(
        (email) => ({
          emailAddress: { address: email },
        })
      );
    }

    if (bcc && bcc.length > 0) {
      (replyMessage.message as Record<string, unknown>).bccRecipients = bcc.map(
        (email) => ({
          emailAddress: { address: email },
        })
      );
    }

    // Create the empty draft
    const createDraftResponse = await fetchFromOutlook(endpoint, accessToken, {
      method: "POST",
    });

    if (!createDraftResponse.ok) {
      const errorText = await getErrorText(createDraftResponse);
      if (createDraftResponse.status === 404) {
        return new Err(
          new MCPError(`Message not found: ${messageId}`, {
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

    // Get the existing body content from the created draft (includes quoted original message)
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const existingBody = createDraftResult.body?.content || "";

    // Prepend the new body to the existing HTML content
    const sanitizedBody = sanitizeHtml(body);
    const combinedBody = `<div>${sanitizedBody}</div><br><br>${existingBody}`;

    const updateDraftResponse = await fetchFromOutlook(
      `/me/messages/${createDraftResult.id}`,
      accessToken,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          body: {
            contentType: "html",
            content: combinedBody,
          },
        }),
      }
    );

    if (!updateDraftResponse.ok) {
      const errorText = await getErrorText(updateDraftResponse);
      return new Err(new MCPError(`Failed to update the draft: ${errorText}`));
    }

    return new Ok([
      { type: "text" as const, text: "Reply draft created successfully" },
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            messageId: createDraftResult.id,
            conversationId: createDraftResult.conversationId,
            originalMessageId: messageId,
            subject: createDraftResult.subject,
          },
          null,
          2
        ),
      },
    ]);
  },

  send_mail: async (
    {
      to,
      cc,
      bcc,
      replyTo,
      subject,
      contentType = "text",
      body,
      saveToSentItems = true,
    },
    { authInfo }
  ) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }

    const message: Record<string, unknown> = {
      subject,
      body: {
        contentType,
        content: body,
      },
      toRecipients: to.map((email) => ({
        emailAddress: { address: email },
      })),
    };

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

    const response = await fetchFromOutlook("/me/sendMail", accessToken, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        saveToSentItems,
      }),
    });

    if (!response.ok) {
      const errorText = await getErrorText(response);
      return new Err(
        new MCPError(
          `Failed to send email: ${response.status} ${response.statusText} - ${errorText}`
        )
      );
    }

    return new Ok([{ type: "text" as const, text: "Email sent successfully" }]);
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
