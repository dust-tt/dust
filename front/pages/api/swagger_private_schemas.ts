/**
 * @swagger
 * components:
 *   schemas:
 *     PrivateUser:
 *       type: object
 *       description: Authenticated user with their workspaces and subscriber hash.
 *       required:
 *         - sId
 *         - id
 *         - createdAt
 *         - username
 *         - email
 *         - firstName
 *         - fullName
 *         - workspaces
 *       properties:
 *         sId:
 *           type: string
 *           description: Unique string identifier for the user
 *         id:
 *           type: integer
 *           description: Numeric model identifier
 *         createdAt:
 *           type: integer
 *           description: Unix timestamp of user creation
 *         provider:
 *           type: string
 *           nullable: true
 *           enum: [auth0, github, google, okta, samlp, waad]
 *           description: Authentication provider
 *         username:
 *           type: string
 *         email:
 *           type: string
 *         firstName:
 *           type: string
 *         lastName:
 *           type: string
 *           nullable: true
 *         fullName:
 *           type: string
 *         image:
 *           type: string
 *           nullable: true
 *           description: URL of the user's profile image
 *         lastLoginAt:
 *           type: integer
 *           nullable: true
 *         workspaces:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PrivateWorkspace'
 *         selectedWorkspace:
 *           type: string
 *           description: sId of the currently selected workspace
 *         origin:
 *           type: string
 *           description: How the user joined (e.g. invitation, provisioned)
 *         subscriberHash:
 *           type: string
 *           nullable: true
 *           description: Hash used for Intercom identity verification
 *     PrivateWorkspace:
 *       type: object
 *       description: Workspace as returned by the private API, includes SSO and provider settings.
 *       required:
 *         - id
 *         - sId
 *         - name
 *         - role
 *       properties:
 *         id:
 *           type: integer
 *         sId:
 *           type: string
 *         name:
 *           type: string
 *         role:
 *           type: string
 *           enum: [admin, builder, user, none]
 *         segmentation:
 *           type: string
 *           nullable: true
 *         whiteListedProviders:
 *           type: array
 *           nullable: true
 *           items:
 *             type: string
 *           description: Allowed model provider IDs
 *         defaultEmbeddingProvider:
 *           type: string
 *           nullable: true
 *         ssoEnforced:
 *           type: boolean
 *         metadata:
 *           type: object
 *           nullable: true
 *           additionalProperties: true
 *     PrivateConversation:
 *       type: object
 *       description: Conversation without content, used in list responses.
 *       required:
 *         - id
 *         - created
 *         - updated
 *         - sId
 *         - depth
 *       properties:
 *         id:
 *           type: integer
 *         created:
 *           type: integer
 *           description: Unix timestamp of creation
 *         updated:
 *           type: integer
 *           description: Unix timestamp of last update
 *         unread:
 *           type: boolean
 *         lastReadMs:
 *           type: integer
 *           nullable: true
 *         actionRequired:
 *           type: boolean
 *           description: Whether the conversation requires user action
 *         hasError:
 *           type: boolean
 *         sId:
 *           type: string
 *         title:
 *           type: string
 *           nullable: true
 *         spaceId:
 *           type: string
 *           nullable: true
 *           description: ID of the space the conversation belongs to (for project conversations)
 *         triggerId:
 *           type: string
 *           nullable: true
 *         depth:
 *           type: integer
 *           description: Conversation depth (for agent handover chains)
 *         metadata:
 *           type: object
 *           additionalProperties: true
 *         requestedSpaceIds:
 *           type: array
 *           items:
 *             type: string
 *     PrivateFullConversation:
 *       type: object
 *       description: Full conversation including content, owner, and visibility.
 *       allOf:
 *         - $ref: '#/components/schemas/PrivateConversation'
 *         - type: object
 *           properties:
 *             owner:
 *               $ref: '#/components/schemas/PrivateWorkspace'
 *             visibility:
 *               type: string
 *               enum: [unlisted, deleted, test]
 *             branchId:
 *               type: string
 *               nullable: true
 *             content:
 *               type: array
 *               description: Array of message arrays (versions/retries)
 *               items:
 *                 type: array
 *                 items:
 *                   oneOf:
 *                     - $ref: '#/components/schemas/PrivateUserMessage'
 *                     - $ref: '#/components/schemas/PrivateAgentMessage'
 *                     - $ref: '#/components/schemas/PrivateContentFragment'
 *     PrivateUserMessage:
 *       type: object
 *       description: A user message in a conversation.
 *       required:
 *         - type
 *         - sId
 *         - content
 *         - version
 *         - rank
 *         - created
 *       properties:
 *         id:
 *           type: integer
 *         type:
 *           type: string
 *           enum: [user_message]
 *         sId:
 *           type: string
 *         created:
 *           type: integer
 *         visibility:
 *           type: string
 *           enum: [visible, deleted]
 *         version:
 *           type: integer
 *         rank:
 *           type: integer
 *         user:
 *           type: object
 *           nullable: true
 *           description: The user who sent the message
 *           properties:
 *             sId:
 *               type: string
 *             username:
 *               type: string
 *             fullName:
 *               type: string
 *             image:
 *               type: string
 *               nullable: true
 *         mentions:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PrivateMention'
 *         richMentions:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PrivateRichMentionWithStatus'
 *         content:
 *           type: string
 *         context:
 *           $ref: '#/components/schemas/PrivateUserMessageContext'
 *         reactions:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PrivateReaction'
 *     PrivateAgentMessage:
 *       type: object
 *       description: An agent message in a conversation.
 *       required:
 *         - type
 *         - sId
 *         - version
 *         - rank
 *         - status
 *         - parentMessageId
 *       properties:
 *         id:
 *           type: integer
 *         agentMessageId:
 *           type: integer
 *         type:
 *           type: string
 *           enum: [agent_message]
 *         sId:
 *           type: string
 *         created:
 *           type: integer
 *         completedTs:
 *           type: integer
 *           nullable: true
 *         visibility:
 *           type: string
 *           enum: [visible, deleted]
 *         version:
 *           type: integer
 *         rank:
 *           type: integer
 *         parentMessageId:
 *           type: string
 *         parentAgentMessageId:
 *           type: string
 *           nullable: true
 *           description: If handover, the agent message that summoned this agent
 *         status:
 *           type: string
 *           enum: [created, succeeded, failed, cancelled]
 *         content:
 *           type: string
 *           nullable: true
 *         chainOfThought:
 *           type: string
 *           nullable: true
 *         error:
 *           type: object
 *           nullable: true
 *           properties:
 *             code:
 *               type: string
 *             message:
 *               type: string
 *             metadata:
 *               type: object
 *               nullable: true
 *         configuration:
 *           $ref: '#/components/schemas/PrivateLightAgentConfiguration'
 *         actions:
 *           type: array
 *           items:
 *             type: object
 *           description: MCP actions executed by the agent
 *         contents:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               step:
 *                 type: integer
 *               content:
 *                 type: object
 *         skipToolsValidation:
 *           type: boolean
 *         richMentions:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PrivateRichMentionWithStatus'
 *         completionDurationMs:
 *           type: integer
 *           nullable: true
 *         reactions:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PrivateReaction'
 *     PrivateLightAgentMessage:
 *       type: object
 *       description: A lighter agent message used in paginated message list responses.
 *       required:
 *         - type
 *         - sId
 *         - version
 *         - rank
 *         - status
 *         - parentMessageId
 *         - configuration
 *       properties:
 *         type:
 *           type: string
 *           enum: [agent_message]
 *         sId:
 *           type: string
 *         created:
 *           type: integer
 *         completedTs:
 *           type: integer
 *           nullable: true
 *         visibility:
 *           type: string
 *           enum: [visible, deleted]
 *         version:
 *           type: integer
 *         rank:
 *           type: integer
 *         parentMessageId:
 *           type: string
 *         parentAgentMessageId:
 *           type: string
 *           nullable: true
 *         status:
 *           type: string
 *           enum: [created, succeeded, failed, cancelled]
 *         content:
 *           type: string
 *           nullable: true
 *         chainOfThought:
 *           type: string
 *           nullable: true
 *         error:
 *           type: object
 *           nullable: true
 *           properties:
 *             code:
 *               type: string
 *             message:
 *               type: string
 *             metadata:
 *               type: object
 *               nullable: true
 *         configuration:
 *           type: object
 *           description: Minimal agent configuration info
 *           properties:
 *             sId:
 *               type: string
 *             name:
 *               type: string
 *             pictureUrl:
 *               type: string
 *             status:
 *               type: string
 *             canRead:
 *               type: boolean
 *         citations:
 *           type: object
 *           additionalProperties:
 *             $ref: '#/components/schemas/PrivateCitation'
 *         generatedFiles:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               fileId:
 *                 type: string
 *               title:
 *                 type: string
 *               contentType:
 *                 type: string
 *               publicUrl:
 *                 type: string
 *         richMentions:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PrivateRichMentionWithStatus'
 *         completionDurationMs:
 *           type: integer
 *           nullable: true
 *         activitySteps:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [thinking, action]
 *               content:
 *                 type: string
 *                 description: Chain of thought text (thinking steps only)
 *               label:
 *                 type: string
 *                 description: Action display label (action steps only)
 *               id:
 *                 type: string
 *         reactions:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PrivateReaction'
 *     PrivateCitation:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         href:
 *           type: string
 *         provider:
 *           type: string
 *         contentType:
 *           type: string
 *     PrivateContentFragment:
 *       type: object
 *       description: A content fragment (file or content node attachment) in a conversation.
 *       required:
 *         - type
 *         - sId
 *         - title
 *         - contentType
 *         - contentFragmentType
 *       properties:
 *         type:
 *           type: string
 *           enum: [content_fragment]
 *         id:
 *           type: integer
 *         sId:
 *           type: string
 *         created:
 *           type: integer
 *         visibility:
 *           type: string
 *           enum: [visible, deleted]
 *         version:
 *           type: integer
 *         rank:
 *           type: integer
 *         title:
 *           type: string
 *         contentType:
 *           type: string
 *           description: MIME type of the content
 *         sourceUrl:
 *           type: string
 *           nullable: true
 *         context:
 *           type: object
 *           properties:
 *             username:
 *               type: string
 *               nullable: true
 *             fullName:
 *               type: string
 *               nullable: true
 *             email:
 *               type: string
 *               nullable: true
 *             profilePictureUrl:
 *               type: string
 *               nullable: true
 *         contentFragmentId:
 *           type: string
 *         contentFragmentVersion:
 *           type: string
 *           enum: [superseded, latest]
 *         contentFragmentType:
 *           type: string
 *           enum: [file, content_node]
 *           description: Whether this is a file upload or a content node reference
 *         expiredReason:
 *           type: string
 *           nullable: true
 *           enum: [data_source_deleted]
 *         fileId:
 *           type: string
 *           nullable: true
 *           description: Present for file content fragments
 *         snippet:
 *           type: string
 *           nullable: true
 *         textUrl:
 *           type: string
 *           nullable: true
 *         textBytes:
 *           type: integer
 *           nullable: true
 *         nodeId:
 *           type: string
 *           nullable: true
 *           description: Present for content node fragments
 *         nodeDataSourceViewId:
 *           type: string
 *           nullable: true
 *     PrivateLightAgentConfiguration:
 *       type: object
 *       description: Agent configuration as returned by the private list endpoint.
 *       required:
 *         - id
 *         - sId
 *         - version
 *         - name
 *         - description
 *         - pictureUrl
 *         - status
 *         - scope
 *         - model
 *         - maxStepsPerRun
 *         - tags
 *       properties:
 *         id:
 *           type: integer
 *         sId:
 *           type: string
 *         version:
 *           type: integer
 *         versionCreatedAt:
 *           type: string
 *           nullable: true
 *         versionAuthorId:
 *           type: integer
 *           nullable: true
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         instructions:
 *           type: string
 *           nullable: true
 *         pictureUrl:
 *           type: string
 *         status:
 *           type: string
 *           description: Agent status
 *           enum: [active, archived, draft, pending, disabled_by_admin, disabled_missing_datasource, disabled_free_workspace]
 *         scope:
 *           type: string
 *           enum: [global, visible, hidden]
 *         userFavorite:
 *           type: boolean
 *         model:
 *           type: object
 *           properties:
 *             providerId:
 *               type: string
 *             modelId:
 *               type: string
 *             temperature:
 *               type: number
 *             reasoningEffort:
 *               type: string
 *               enum: [none, light, medium, high]
 *         maxStepsPerRun:
 *           type: integer
 *         tags:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               sId:
 *                 type: string
 *               name:
 *                 type: string
 *         templateId:
 *           type: string
 *           nullable: true
 *         requestedGroupIds:
 *           type: array
 *           items:
 *             type: array
 *             items:
 *               type: string
 *         requestedSpaceIds:
 *           type: array
 *           items:
 *             type: string
 *         canRead:
 *           type: boolean
 *         canEdit:
 *           type: boolean
 *         lastAuthors:
 *           type: array
 *           description: Optional, returned when withAuthors query param is set
 *           items:
 *             type: string
 *         editors:
 *           type: array
 *           description: Optional, returned when withEditors query param is set
 *           items:
 *             type: object
 *             properties:
 *               sId:
 *                 type: string
 *               fullName:
 *                 type: string
 *               image:
 *                 type: string
 *                 nullable: true
 *         usage:
 *           type: object
 *           description: Optional, returned when withUsage query param is set
 *           properties:
 *             messageCount:
 *               type: integer
 *             conversationCount:
 *               type: integer
 *             userCount:
 *               type: integer
 *             timePeriodSec:
 *               type: integer
 *         feedbacks:
 *           type: object
 *           description: Optional, returned when withFeedbacks query param is set
 *           properties:
 *             up:
 *               type: integer
 *             down:
 *               type: integer
 *     PrivateFileWithUploadUrl:
 *       type: object
 *       description: File record with a pre-signed upload URL.
 *       required:
 *         - sId
 *         - id
 *         - fileName
 *         - fileSize
 *         - contentType
 *         - status
 *         - useCase
 *         - uploadUrl
 *       properties:
 *         sId:
 *           type: string
 *         id:
 *           type: string
 *         contentType:
 *           type: string
 *         fileName:
 *           type: string
 *         fileSize:
 *           type: integer
 *         version:
 *           type: integer
 *         status:
 *           type: string
 *           enum: [created, failed, ready]
 *         useCase:
 *           type: string
 *           enum: [conversation, avatar, tool_output, upsert_document, folders_document, upsert_table, project_context, skill_attachment]
 *         uploadUrl:
 *           type: string
 *           description: Pre-signed URL for uploading the file content
 *         downloadUrl:
 *           type: string
 *         publicUrl:
 *           type: string
 *     PrivateSpace:
 *       type: object
 *       description: A space in the workspace.
 *       required:
 *         - sId
 *         - name
 *         - kind
 *         - groupIds
 *         - isRestricted
 *         - managementMode
 *       properties:
 *         sId:
 *           type: string
 *         name:
 *           type: string
 *         kind:
 *           type: string
 *           enum: [global, system, conversations, regular, project]
 *         groupIds:
 *           type: array
 *           items:
 *             type: string
 *         isRestricted:
 *           type: boolean
 *         managementMode:
 *           type: string
 *           enum: [manual, group]
 *         createdAt:
 *           type: integer
 *         updatedAt:
 *           type: integer
 *     PrivateProject:
 *       type: object
 *       description: A project space with additional metadata.
 *       allOf:
 *         - $ref: '#/components/schemas/PrivateSpace'
 *         - type: object
 *           properties:
 *             description:
 *               type: string
 *               nullable: true
 *             isMember:
 *               type: boolean
 *             archivedAt:
 *               type: integer
 *               nullable: true
 *     PrivateDataSourceView:
 *       type: object
 *       description: A view on a data source within a space.
 *       required:
 *         - sId
 *         - id
 *         - category
 *         - kind
 *         - spaceId
 *         - dataSource
 *       properties:
 *         sId:
 *           type: string
 *         id:
 *           type: integer
 *         category:
 *           type: string
 *           enum: [managed, folder, website, apps]
 *         kind:
 *           type: string
 *           enum: [default, custom]
 *         spaceId:
 *           type: string
 *         createdAt:
 *           type: integer
 *         updatedAt:
 *           type: integer
 *         parentsIn:
 *           type: array
 *           nullable: true
 *           items:
 *             type: string
 *           description: List of parent IDs included in this view, null if the full data source is used
 *         dataSource:
 *           $ref: '#/components/schemas/PrivateDataSource'
 *         editedByUser:
 *           type: object
 *           nullable: true
 *           properties:
 *             editedAt:
 *               type: integer
 *               nullable: true
 *             fullName:
 *               type: string
 *               nullable: true
 *             imageUrl:
 *               type: string
 *               nullable: true
 *             email:
 *               type: string
 *               nullable: true
 *             userId:
 *               type: string
 *               nullable: true
 *     PrivateDataSource:
 *       type: object
 *       description: A data source in the workspace.
 *       required:
 *         - sId
 *         - id
 *         - name
 *       properties:
 *         sId:
 *           type: string
 *         id:
 *           type: integer
 *         createdAt:
 *           type: integer
 *         name:
 *           type: string
 *         description:
 *           type: string
 *           nullable: true
 *         assistantDefaultSelected:
 *           type: boolean
 *         dustAPIProjectId:
 *           type: string
 *         dustAPIDataSourceId:
 *           type: string
 *         connectorId:
 *           type: string
 *           nullable: true
 *         connectorProvider:
 *           type: string
 *           nullable: true
 *     PrivateMentionSuggestion:
 *       type: object
 *       description: A rich mention suggestion for agents or users.
 *       required:
 *         - id
 *         - type
 *         - label
 *         - pictureUrl
 *         - description
 *       properties:
 *         id:
 *           type: string
 *           description: Agent sId or user sId
 *         type:
 *           type: string
 *           enum: [agent, user]
 *         label:
 *           type: string
 *           description: Display name
 *         pictureUrl:
 *           type: string
 *         description:
 *           type: string
 *           description: Agent description or user email
 *         userFavorite:
 *           type: boolean
 *           description: Whether the agent is a user favorite (agent mentions only)
 *     PrivateFeatureFlags:
 *       type: object
 *       description: Workspace feature flags response.
 *       required:
 *         - feature_flags
 *       properties:
 *         feature_flags:
 *           type: array
 *           items:
 *             type: string
 *           description: List of enabled feature flag names for the workspace
 *     PrivateExtensionConfig:
 *       type: object
 *       description: Extension configuration for the workspace.
 *       required:
 *         - blacklistedDomains
 *       properties:
 *         blacklistedDomains:
 *           type: array
 *           items:
 *             type: string
 *           description: Domains where the extension should not activate
 *     PrivateFeedback:
 *       type: object
 *       description: User feedback on an agent message.
 *       required:
 *         - id
 *         - sId
 *         - messageId
 *         - agentMessageId
 *         - userId
 *         - thumbDirection
 *         - agentConfigurationId
 *         - agentConfigurationVersion
 *         - isConversationShared
 *         - dismissed
 *         - createdAt
 *       properties:
 *         id:
 *           type: integer
 *         sId:
 *           type: string
 *         messageId:
 *           type: string
 *         agentMessageId:
 *           type: integer
 *         userId:
 *           type: integer
 *         thumbDirection:
 *           type: string
 *           enum: [up, down]
 *         content:
 *           type: string
 *           nullable: true
 *           description: Optional text feedback from the user
 *         createdAt:
 *           type: string
 *           format: date-time
 *         agentConfigurationId:
 *           type: string
 *         agentConfigurationVersion:
 *           type: integer
 *         isConversationShared:
 *           type: boolean
 *         dismissed:
 *           type: boolean
 *     PrivateMention:
 *       type: object
 *       description: A mention in a message (agent or user).
 *       properties:
 *         configurationId:
 *           type: string
 *           description: Agent configuration sId (for agent mentions)
 *         type:
 *           type: string
 *           enum: [user]
 *           description: Present only for user mentions
 *         userId:
 *           type: string
 *           description: User sId (for user mentions)
 *     PrivateRichMentionWithStatus:
 *       type: object
 *       description: A rich mention with approval status, used in message responses.
 *       required:
 *         - id
 *         - type
 *         - label
 *         - pictureUrl
 *         - description
 *         - dismissed
 *         - status
 *       properties:
 *         id:
 *           type: string
 *         type:
 *           type: string
 *           enum: [agent, user]
 *         label:
 *           type: string
 *         pictureUrl:
 *           type: string
 *         description:
 *           type: string
 *         userFavorite:
 *           type: boolean
 *         dismissed:
 *           type: boolean
 *         status:
 *           type: string
 *           enum: [pending_conversation_access, pending_project_membership, approved, rejected, user_restricted_by_conversation_access, agent_restricted_by_space_usage]
 *     PrivateUserMessageContext:
 *       type: object
 *       description: Context metadata for a user message.
 *       required:
 *         - username
 *         - timezone
 *         - origin
 *       properties:
 *         username:
 *           type: string
 *         fullName:
 *           type: string
 *           nullable: true
 *         email:
 *           type: string
 *           nullable: true
 *         profilePictureUrl:
 *           type: string
 *           nullable: true
 *         timezone:
 *           type: string
 *         origin:
 *           type: string
 *           enum: [web, project_kickoff, extension, agent_sidekick, api, cli, cli_programmatic, email, excel, gsheet, make, n8n, powerpoint, raycast, slack, slack_workflow, teams, transcript, triggered_programmatic, triggered, zapier, zendesk, onboarding_conversation, project_butler]
 *     PrivateReaction:
 *       type: object
 *       description: A reaction on a message.
 *       required:
 *         - emoji
 *         - users
 *       properties:
 *         emoji:
 *           type: string
 *         users:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 nullable: true
 *               username:
 *                 type: string
 *               fullName:
 *                 type: string
 *                 nullable: true
 *     PrivateConversationEvent:
 *       type: object
 *       description: Server-Sent Event for conversation-level streaming. Discriminated on the `type` field.
 *       discriminator:
 *         propertyName: type
 *       oneOf:
 *         - $ref: '#/components/schemas/PrivateUserMessageNewEvent'
 *         - $ref: '#/components/schemas/PrivateAgentMessageNewEvent'
 *         - $ref: '#/components/schemas/PrivateAgentMessageDoneEvent'
 *         - $ref: '#/components/schemas/PrivateConversationTitleEvent'
 *         - $ref: '#/components/schemas/PrivateButlerSuggestionCreatedEvent'
 *         - $ref: '#/components/schemas/PrivateButlerThinkingEvent'
 *         - $ref: '#/components/schemas/PrivateButlerDoneEvent'
 *     PrivateUserMessageNewEvent:
 *       type: object
 *       required: [type, created, messageId, message]
 *       properties:
 *         type:
 *           type: string
 *           enum: [user_message_new]
 *         created:
 *           type: integer
 *         messageId:
 *           type: string
 *         message:
 *           $ref: '#/components/schemas/PrivateUserMessage'
 *     PrivateAgentMessageNewEvent:
 *       type: object
 *       required: [type, created, configurationId, messageId, message]
 *       properties:
 *         type:
 *           type: string
 *           enum: [agent_message_new]
 *         created:
 *           type: integer
 *         configurationId:
 *           type: string
 *         messageId:
 *           type: string
 *         message:
 *           $ref: '#/components/schemas/PrivateAgentMessage'
 *     PrivateAgentMessageDoneEvent:
 *       type: object
 *       required: [type, created, conversationId, configurationId, messageId, status]
 *       properties:
 *         type:
 *           type: string
 *           enum: [agent_message_done]
 *         created:
 *           type: integer
 *         conversationId:
 *           type: string
 *         configurationId:
 *           type: string
 *         messageId:
 *           type: string
 *         status:
 *           type: string
 *           enum: [success, error]
 *     PrivateConversationTitleEvent:
 *       type: object
 *       required: [type, created, title]
 *       properties:
 *         type:
 *           type: string
 *           enum: [conversation_title]
 *         created:
 *           type: integer
 *         title:
 *           type: string
 *     PrivateButlerSuggestionCreatedEvent:
 *       type: object
 *       required: [type, created, suggestion]
 *       properties:
 *         type:
 *           type: string
 *           enum: [butler_suggestion_created]
 *         created:
 *           type: integer
 *         suggestion:
 *           type: object
 *           description: Butler suggestion details
 *     PrivateButlerThinkingEvent:
 *       type: object
 *       required: [type, created]
 *       properties:
 *         type:
 *           type: string
 *           enum: [butler_thinking]
 *         created:
 *           type: integer
 *     PrivateButlerDoneEvent:
 *       type: object
 *       required: [type, created]
 *       properties:
 *         type:
 *           type: string
 *           enum: [butler_done]
 *         created:
 *           type: integer
 *     PrivateAgentMessageEvent:
 *       type: object
 *       description: Server-Sent Event for agent message streaming. Discriminated on the `type` field. Each event also includes a `step` integer.
 *       discriminator:
 *         propertyName: type
 *       oneOf:
 *         - $ref: '#/components/schemas/PrivateGenerationTokensEvent'
 *         - $ref: '#/components/schemas/PrivateAgentActionSuccessEvent'
 *         - $ref: '#/components/schemas/PrivateAgentMessageSuccessEvent'
 *         - $ref: '#/components/schemas/PrivateAgentErrorEvent'
 *         - $ref: '#/components/schemas/PrivateAgentGenerationCancelledEvent'
 *         - $ref: '#/components/schemas/PrivateToolErrorEvent'
 *         - $ref: '#/components/schemas/PrivateToolParamsEvent'
 *         - $ref: '#/components/schemas/PrivateToolApproveExecutionEvent'
 *         - $ref: '#/components/schemas/PrivateToolNotificationEvent'
 *         - $ref: '#/components/schemas/PrivateToolPersonalAuthRequiredEvent'
 *         - $ref: '#/components/schemas/PrivateToolFileAuthRequiredEvent'
 *         - $ref: '#/components/schemas/PrivateAgentContextPrunedEvent'
 *     PrivateGenerationTokensEvent:
 *       type: object
 *       required: [type, created, configurationId, messageId, text, classification]
 *       properties:
 *         type:
 *           type: string
 *           enum: [generation_tokens]
 *         created:
 *           type: integer
 *         configurationId:
 *           type: string
 *         messageId:
 *           type: string
 *         text:
 *           type: string
 *           description: The token(s) generated in this chunk
 *         classification:
 *           type: string
 *           enum: [tokens, chain_of_thought, opening_delimiter, closing_delimiter]
 *         delimiterClassification:
 *           type: string
 *           description: Present when classification is opening_delimiter or closing_delimiter
 *         step:
 *           type: integer
 *     PrivateAgentActionSuccessEvent:
 *       type: object
 *       required: [type, created, configurationId, messageId, action]
 *       properties:
 *         type:
 *           type: string
 *           enum: [agent_action_success]
 *         created:
 *           type: integer
 *         configurationId:
 *           type: string
 *         messageId:
 *           type: string
 *         action:
 *           type: object
 *           description: The MCP action that completed successfully
 *         step:
 *           type: integer
 *     PrivateAgentMessageSuccessEvent:
 *       type: object
 *       required: [type, created, configurationId, messageId, message, runIds]
 *       properties:
 *         type:
 *           type: string
 *           enum: [agent_message_success]
 *         created:
 *           type: integer
 *         configurationId:
 *           type: string
 *         messageId:
 *           type: string
 *         message:
 *           $ref: '#/components/schemas/PrivateAgentMessage'
 *         runIds:
 *           type: array
 *           items:
 *             type: string
 *         step:
 *           type: integer
 *     PrivateAgentErrorEvent:
 *       type: object
 *       required: [type, created, configurationId, messageId, error]
 *       properties:
 *         type:
 *           type: string
 *           enum: [agent_error]
 *         created:
 *           type: integer
 *         configurationId:
 *           type: string
 *         messageId:
 *           type: string
 *         error:
 *           type: object
 *           properties:
 *             code:
 *               type: string
 *             message:
 *               type: string
 *         runIds:
 *           type: array
 *           items:
 *             type: string
 *         step:
 *           type: integer
 *     PrivateAgentGenerationCancelledEvent:
 *       type: object
 *       required: [type, created, configurationId, messageId]
 *       properties:
 *         type:
 *           type: string
 *           enum: [agent_generation_cancelled]
 *         created:
 *           type: integer
 *         configurationId:
 *           type: string
 *         messageId:
 *           type: string
 *         step:
 *           type: integer
 *     PrivateToolErrorEvent:
 *       type: object
 *       required: [type, created, configurationId, messageId, conversationId, error, isLastBlockingEventForStep]
 *       properties:
 *         type:
 *           type: string
 *           enum: [tool_error]
 *         created:
 *           type: integer
 *         configurationId:
 *           type: string
 *         messageId:
 *           type: string
 *         conversationId:
 *           type: string
 *         error:
 *           type: object
 *           properties:
 *             code:
 *               type: string
 *             message:
 *               type: string
 *         isLastBlockingEventForStep:
 *           type: boolean
 *         step:
 *           type: integer
 *     PrivateToolParamsEvent:
 *       type: object
 *       required: [type, created, configurationId, messageId, action]
 *       properties:
 *         type:
 *           type: string
 *           enum: [tool_params]
 *         created:
 *           type: integer
 *         configurationId:
 *           type: string
 *         messageId:
 *           type: string
 *         action:
 *           type: object
 *           description: The MCP action with its parameters
 *         runIds:
 *           type: array
 *           items:
 *             type: string
 *         step:
 *           type: integer
 *     PrivateToolApproveExecutionEvent:
 *       type: object
 *       description: Sent when a tool requires user approval before execution.
 *       required: [type, created, conversationId, messageId, actionId, configurationId, inputs]
 *       properties:
 *         type:
 *           type: string
 *           enum: [tool_approve_execution]
 *         created:
 *           type: integer
 *         conversationId:
 *           type: string
 *         messageId:
 *           type: string
 *         actionId:
 *           type: string
 *         configurationId:
 *           type: string
 *         inputs:
 *           type: object
 *           additionalProperties: true
 *         stake:
 *           type: string
 *           description: Risk level of the tool execution
 *         isLastBlockingEventForStep:
 *           type: boolean
 *         metadata:
 *           type: object
 *         step:
 *           type: integer
 *     PrivateToolNotificationEvent:
 *       type: object
 *       description: Progress notification from a running tool.
 *       required: [type, created, configurationId, conversationId, messageId, action, notification]
 *       properties:
 *         type:
 *           type: string
 *           enum: [tool_notification]
 *         created:
 *           type: integer
 *         configurationId:
 *           type: string
 *         conversationId:
 *           type: string
 *         messageId:
 *           type: string
 *         action:
 *           type: object
 *           description: The MCP action producing the notification
 *         notification:
 *           type: object
 *           description: Progress notification content
 *         step:
 *           type: integer
 *     PrivateToolPersonalAuthRequiredEvent:
 *       type: object
 *       description: Sent when a tool requires personal OAuth authentication.
 *       required: [type, created, conversationId, messageId, actionId, configurationId, authError]
 *       properties:
 *         type:
 *           type: string
 *           enum: [tool_personal_auth_required]
 *         created:
 *           type: integer
 *         conversationId:
 *           type: string
 *         messageId:
 *           type: string
 *         actionId:
 *           type: string
 *         configurationId:
 *           type: string
 *         authError:
 *           type: object
 *           properties:
 *             mcpServerId:
 *               type: string
 *             provider:
 *               type: string
 *             scope:
 *               type: string
 *             toolName:
 *               type: string
 *             message:
 *               type: string
 *         step:
 *           type: integer
 *     PrivateToolFileAuthRequiredEvent:
 *       type: object
 *       description: Sent when a tool requires file access authorization (e.g., Google Drive).
 *       required: [type, created, conversationId, messageId, actionId, configurationId, fileAuthError]
 *       properties:
 *         type:
 *           type: string
 *           enum: [tool_file_auth_required]
 *         created:
 *           type: integer
 *         conversationId:
 *           type: string
 *         messageId:
 *           type: string
 *         actionId:
 *           type: string
 *         configurationId:
 *           type: string
 *         fileAuthError:
 *           type: object
 *           properties:
 *             fileId:
 *               type: string
 *             fileName:
 *               type: string
 *             connectionId:
 *               type: string
 *             mimeType:
 *               type: string
 *             toolName:
 *               type: string
 *             message:
 *               type: string
 *         step:
 *           type: integer
 *     PrivateAgentContextPrunedEvent:
 *       type: object
 *       required: [type, created, configurationId, messageId]
 *       properties:
 *         type:
 *           type: string
 *           enum: [agent_context_pruned]
 *         created:
 *           type: integer
 *         configurationId:
 *           type: string
 *         messageId:
 *           type: string
 *         step:
 *           type: integer
 */
