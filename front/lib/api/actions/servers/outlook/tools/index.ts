import sanitizeHtml from "sanitize-html";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { OUTLOOK_TOOLS_METADATA } from "@app/lib/api/actions/servers/outlook/metadata";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { Err, Ok } from "@app/types";

const OutlookEmailAddressSchema = z.object({
  address: z.string(),
  name: z.string().optional(),
});

const OutlookRecipientSchema = z.object({
  emailAddress: OutlookEmailAddressSchema,
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const OutlookMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string().optional(),
  subject: z.string().optional(),
  bodyPreview: z.string().optional(),
  importance: z.string().optional(),
  receivedDateTime: z.string().optional(),
  sentDateTime: z.string().optional(),
  hasAttachments: z.boolean().optional(),
  isDraft: z.boolean().optional(),
  isRead: z.boolean().optional(),
  from: OutlookRecipientSchema.optional(),
  toRecipients: z.array(OutlookRecipientSchema).optional(),
  ccRecipients: z.array(OutlookRecipientSchema).optional(),
  bccRecipients: z.array(OutlookRecipientSchema).optional(),
  body: z
    .object({
      contentType: z.string().default("text"),
      content: z.string(),
    })
    .optional(),
  parentFolderId: z.string().optional(),
  conversationIndex: z.string().optional(),
  internetMessageId: z.string().optional(),
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const OutlookContactSchema = z.object({
  id: z.string(),
  displayName: z.string().optional(),
  givenName: z.string().optional(),
  surname: z.string().optional(),
  emailAddresses: z
    .array(
      z.object({
        address: z.string(),
        name: z.string().optional(),
      })
    )
    .optional(),
  businessPhones: z.array(z.string()).optional(),
  homePhones: z.array(z.string()).optional(),
  mobilePhone: z.string().optional(),
  jobTitle: z.string().optional(),
  companyName: z.string().optional(),
  department: z.string().optional(),
  officeLocation: z.string().optional(),
});

type OutlookMessage = z.infer<typeof OutlookMessageSchema>;
type OutlookContact = z.infer<typeof OutlookContactSchema>;

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

const getErrorText = async (response: Response): Promise<string> => {
  try {
    const errorData = await response.json();
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    return errorData.error?.message || errorData.error?.code || "Unknown error";
  } catch {
    return "Unknown error";
  }
};

const handlers: ToolHandlers<typeof OUTLOOK_TOOLS_METADATA> = {
  get_messages: async ({ search, top = 10, skip = 0, select }, { authInfo }) => {
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
        "id,conversationId,subject,bodyPreview,importance,receivedDateTime,sentDateTime,hasAttachments,isDraft,isRead,from,toRecipients,ccRecipients,parentFolderId"
      );
    }

    const response = await fetchFromOutlook(
      `/me/messages?${params.toString()}`,
      accessToken,
      { method: "GET" }
    );

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

  get_drafts: async ({ search, top = 10, skip = 0 }, { authInfo }) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }

    const params = new URLSearchParams();
    params.append("$filter", "isDraft eq true");
    params.append("$top", Math.min(top, 100).toString());

    if (search) {
      params.append("$search", `"${search}"`);
    } else {
      params.append("$skip", skip.toString());
    }

    const response = await fetchFromOutlook(
      `/me/messages?${params.toString()}`,
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
          `/me/messages/${draft.id}`,
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
    { to, cc, bcc, subject, contentType, body, importance = "normal" },
    { authInfo }
  ) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("Authentication required"));
    }

    // Create the email message object for Microsoft Graph API
    const message: any = {
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
    {
      messageId,
      body,
      contentType = "html",
      replyAll = false,
      to,
      cc,
      bcc,
    },
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

    const replyMessage: any = {
      message: {
        body: {
          contentType,
          content: body,
        },
      },
    };

    // Add recipients if overriding
    if (to && to.length > 0) {
      replyMessage.message.toRecipients = to.map((email) => ({
        emailAddress: { address: email },
      }));
    }

    if (cc && cc.length > 0) {
      replyMessage.message.ccRecipients = cc.map((email) => ({
        emailAddress: { address: email },
      }));
    }

    if (bcc && bcc.length > 0) {
      replyMessage.message.bccRecipients = bcc.map((email) => ({
        emailAddress: { address: email },
      }));
    }

    // Create the empty draft
    const createDraftResponse = await fetchFromOutlook(
      endpoint,
      accessToken,
      {
        method: "POST",
      }
    );

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
      return new Err(
        new MCPError(`Failed to update the draft: ${errorText}`)
      );
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

  get_contacts: async ({ search, top = 20, skip = 0, select }, { authInfo }) => {
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

    const contact: any = {
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

    const contact: any = {};

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
