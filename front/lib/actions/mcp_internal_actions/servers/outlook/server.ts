import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  makeInternalMCPServer,
  makeMCPToolJSONSuccess,
} from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { Err, Ok } from "@app/types";

const OutlookEmailAddressSchema = z.object({
  address: z.string(),
  name: z.string().optional(),
});

const OutlookRecipientSchema = z.object({
  emailAddress: OutlookEmailAddressSchema,
});

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

const createServer = (auth: Authenticator): McpServer => {
  const server = makeInternalMCPServer("outlook");

  server.tool(
    "get_messages",
    "Get messages from Outlook inbox. Supports search queries to filter messages.",
    {
      search: z
        .string()
        .optional()
        .describe(
          'Search query to filter messages. Examples: "from:someone@example.com", "subject:meeting", "hasAttachments:true". Leave empty to get recent messages.'
        ),
      top: z
        .number()
        .optional()
        .describe(
          "Maximum number of messages to return (default: 10, max: 100)"
        ),
      skip: z
        .number()
        .optional()
        .describe("Number of messages to skip for pagination."),
      select: z
        .array(z.string())
        .optional()
        .describe("Fields to include in the response."),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "outlook" },
      async ({ search, top = 10, skip = 0, select }, { authInfo }) => {
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

        return new Ok(
          makeMCPToolJSONSuccess({
            message: "Messages fetched successfully",
            result: {
              messages: (result.value || []) as OutlookMessage[],
              nextLink: result["@odata.nextLink"],
              totalCount: result["@odata.count"],
            },
          }).content
        );
      }
    )
  );

  server.tool(
    "get_drafts",
    "Get draft emails from Outlook. Returns a limited number of drafts by default to avoid overwhelming responses.",
    {
      search: z
        .string()
        .optional()
        .describe(
          'Search query to filter drafts. Examples: "subject:meeting", "to:someone@example.com".'
        ),
      top: z
        .number()
        .optional()
        .describe("Maximum number of drafts to return (default: 10, max: 100)"),
      skip: z
        .number()
        .optional()
        .describe("Number of drafts to skip for pagination."),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "outlook" },
      async ({ search, top = 10, skip = 0 }, { authInfo }) => {
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

        return new Ok(
          makeMCPToolJSONSuccess({
            message: "Drafts fetched successfully",
            result: {
              drafts: draftDetails.filter(Boolean) as OutlookMessage[],
              nextLink: result["@odata.nextLink"],
            },
          }).content
        );
      }
    )
  );

  server.tool(
    "create_draft",
    `Create a new email draft in Outlook.
- The draft will be saved in the user's Outlook account and can be reviewed and sent later.
- The draft will include proper email headers and formatting`,
    {
      to: z.array(z.string()).describe("The email addresses of the recipients"),
      cc: z.array(z.string()).optional().describe("The email addresses to CC"),
      bcc: z
        .array(z.string())
        .optional()
        .describe("The email addresses to BCC"),
      subject: z.string().describe("The subject line of the email"),
      contentType: z
        .string()
        .default("text")
        .describe("The content type of the email (text or html)."),
      body: z.string().describe("The body of the email"),
      importance: z
        .string()
        .optional()
        .describe("The importance level of the email"),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "outlook" },
      async (
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

        return new Ok(
          makeMCPToolJSONSuccess({
            message: "Draft created successfully",
            result: {
              messageId: result.id,
              conversationId: result.conversationId,
            },
          }).content
        );
      }
    )
  );

  server.tool(
    "delete_draft",
    "Delete a draft email from Outlook.",
    {
      messageId: z.string().describe("The ID of the draft to delete"),
      subject: z.string().describe("The subject of the draft to delete"),
      to: z.array(z.string()).describe("The email addresses of the recipients"),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "outlook" },
      async ({ messageId, subject, to }, { authInfo }) => {
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

        return new Ok(
          makeMCPToolJSONSuccess({
            message: "Draft deleted successfully",
            result: "",
          }).content
        );
      }
    )
  );

  server.tool(
    "create_reply_draft",
    `Create a reply draft to an existing email in Outlook.
- The draft will be saved in the user's Outlook account and can be reviewed and sent later.
- The reply will be properly formatted with the original message quoted.
- The draft will include proper email headers and threading information.`,
    {
      messageId: z.string().describe("The ID of the message to reply to"),
      body: z.string().describe("The body of the reply email"),
      contentType: z
        .string()
        .optional()
        .describe(
          "The content type of the email (text or html). Defaults to html."
        ),
      replyAll: z
        .boolean()
        .optional()
        .describe("Whether to reply to all recipients. Defaults to false."),
      to: z
        .array(z.string())
        .optional()
        .describe("Override the To recipients for the reply."),
      cc: z
        .array(z.string())
        .optional()
        .describe("Override the CC recipients for the reply."),
      bcc: z
        .array(z.string())
        .optional()
        .describe("Override the BCC recipients for the reply."),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "outlook" },
      async (
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

        const response = await fetchFromOutlook(endpoint, accessToken, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(replyMessage),
        });

        if (!response.ok) {
          const errorText = await getErrorText(response);
          if (response.status === 404) {
            return new Err(new MCPError(`Message not found: ${messageId}`));
          }
          return new Err(
            new MCPError(
              `Failed to create reply draft: ${response.status} ${response.statusText} - ${errorText}`
            )
          );
        }

        const result = await response.json();

        return new Ok(
          makeMCPToolJSONSuccess({
            message: "Reply draft created successfully",
            result: {
              messageId: result.id,
              conversationId: result.conversationId,
              originalMessageId: messageId,
              subject: result.subject,
            },
          }).content
        );
      }
    )
  );

  server.tool(
    "get_contacts",
    "Get contacts from Outlook. Supports search queries to filter contacts.",
    {
      search: z
        .string()
        .optional()
        .describe(
          'Search query to filter contacts. Examples: "name:John", "company:Microsoft". Leave empty to get recent contacts.'
        ),
      top: z
        .number()
        .optional()
        .describe(
          "Maximum number of contacts to return (default: 20, max: 100)"
        ),
      skip: z
        .number()
        .optional()
        .describe("Number of contacts to skip for pagination."),
      select: z
        .array(z.string())
        .optional()
        .describe("Fields to include in the response."),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "outlook" },
      async ({ search, top = 20, skip = 0, select }, { authInfo }) => {
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

        return new Ok(
          makeMCPToolJSONSuccess({
            message: "Contacts fetched successfully",
            result: {
              contacts: (result.value || []) as OutlookContact[],
              nextLink: result["@odata.nextLink"],
              totalCount: result["@odata.count"],
            },
          }).content
        );
      }
    )
  );

  server.tool(
    "create_contact",
    "Create a new contact in Outlook.",
    {
      displayName: z.string().describe("Display name of the contact"),
      givenName: z.string().optional().describe("First name of the contact"),
      surname: z.string().optional().describe("Last name of the contact"),
      emailAddresses: z
        .array(
          z.object({
            address: z.string(),
            name: z.string().optional(),
          })
        )
        .optional()
        .describe("Email addresses for the contact"),
      businessPhones: z
        .array(z.string())
        .optional()
        .describe("Business phone numbers"),
      homePhones: z.array(z.string()).optional().describe("Home phone numbers"),
      mobilePhone: z.string().optional().describe("Mobile phone number"),
      jobTitle: z.string().optional().describe("Job title"),
      companyName: z.string().optional().describe("Company name"),
      department: z.string().optional().describe("Department"),
      officeLocation: z.string().optional().describe("Office location"),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "outlook" },
      async (
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

        return new Ok(
          makeMCPToolJSONSuccess({
            message: "Contact created successfully",
            result: result as OutlookContact,
          }).content
        );
      }
    )
  );

  server.tool(
    "update_contact",
    "Update an existing contact in Outlook.",
    {
      contactId: z.string().describe("ID of the contact to update"),
      displayName: z
        .string()
        .optional()
        .describe("Display name of the contact"),
      givenName: z.string().optional().describe("First name of the contact"),
      surname: z.string().optional().describe("Last name of the contact"),
      emailAddresses: z
        .array(
          z.object({
            address: z.string(),
            name: z.string().optional(),
          })
        )
        .optional()
        .describe("Email addresses for the contact"),
      businessPhones: z
        .array(z.string())
        .optional()
        .describe("Business phone numbers"),
      homePhones: z.array(z.string()).optional().describe("Home phone numbers"),
      mobilePhone: z.string().optional().describe("Mobile phone number"),
      jobTitle: z.string().optional().describe("Job title"),
      companyName: z.string().optional().describe("Company name"),
      department: z.string().optional().describe("Department"),
      officeLocation: z.string().optional().describe("Office location"),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "outlook" },
      async (
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
            return new Err(new MCPError(`Contact not found: ${contactId}`));
          }
          return new Err(
            new MCPError(
              `Failed to update contact: ${response.status} ${response.statusText} - ${errorText}`
            )
          );
        }

        const result = await response.json();

        return new Ok(
          makeMCPToolJSONSuccess({
            message: "Contact updated successfully",
            result: result as OutlookContact,
          }).content
        );
      }
    )
  );

  return server;
};

const fetchFromOutlook = async (
  endpoint: string,
  accessToken: string,
  options?: RequestInit
): Promise<Response> => {
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
    return errorData.error?.message || errorData.error?.code || "Unknown error";
  } catch {
    return "Unknown error";
  }
};

export default createServer;
