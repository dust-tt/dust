/**
 * @swagger
 * components:
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       description: Your DUST API key is a Bearer token.
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         sId:
 *           type: string
 *           description: Unique string identifier for the user
 *         id:
 *           type: integer
 *         createdAt:
 *           type: integer
 *         username:
 *           type: string
 *           description: User's chosen username
 *         email:
 *           type: string
 *           description: User's email address
 *         firstName:
 *           type: string
 *           description: User's first name
 *         lastName:
 *           type: string
 *           description: User's last name
 *         fullName:
 *           type: string
 *           description: User's full name
 *         provider:
 *           type: string
 *           description: Authentication provider used by the user
 *         image:
 *           type: string
 *           description: URL of the user's profile image
 *     Workspace:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         sId:
 *           type: string
 *           description: Unique string identifier for the workspace
 *         name:
 *           type: string
 *           description: Name of the workspace
 *         role:
 *           type: string
 *           description: User's role in the workspace
 *         segmentation:
 *           type: string
 *           nullable: true
 *           description: Segmentation information for the workspace
 *         flags:
 *           type: array
 *           items:
 *             type: string
 *             description: Feature flags enabled for the workspace
 *         ssoEnforced:
 *           type: boolean
 *         whiteListedProviders:
 *           type: array
 *           items:
 *             type: string
 *             description: List of allowed authentication providers
 *         defaultEmbeddingProvider:
 *           type: string
 *           nullable: true
 *           description: Default provider for embeddings in the workspace
 *     Context:
 *       type: object
 *       properties:
 *         username:
 *           type: string
 *           description: Username in the current context
 *         timezone:
 *           type: string
 *           description: User's timezone
 *         fullName:
 *           type: string
 *           description: User's full name in the current context
 *         email:
 *           type: string
 *           description: User's email in the current context
 *         profilePictureUrl:
 *           type: string
 *           description: URL of the user's profile picture
 *         origin:
 *           type: string
 *           description: Origin of the context (e.g., 'slack', 'web')
 *     AgentConfiguration:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         sId:
 *           type: string
 *           description: Unique string identifier for the agent configuration
 *         version:
 *           type: integer
 *         versionCreatedAt:
 *           type: string
 *           nullable: true
 *           description: Timestamp of when the version was created
 *         versionAuthorId:
 *           type: string
 *           nullable: true
 *           description: ID of the user who created this version
 *         name:
 *           type: string
 *           description: Name of the agent configuration
 *         description:
 *           type: string
 *           description: Description of the agent configuration
 *         instructions:
 *           type: string
 *           nullable: true
 *           description: Instructions for the agent
 *         pictureUrl:
 *           type: string
 *           description: URL of the agent's picture
 *         status:
 *           type: string
 *           description: Current status of the agent configuration
 *         scope:
 *           type: string
 *           description: Scope of the agent configuration
 *         userListStatus:
 *           type: string
 *           description: Status of the user list for this configuration
 *         model:
 *           type: object
 *           properties:
 *             providerId:
 *               type: string
 *               description: ID of the model provider
 *             modelId:
 *               type: string
 *               description: ID of the specific model
 *             temperature:
 *               type: number
 *         actions:
 *           type: array
 *         maxToolsUsePerRun:
 *           type: integer
 *         templateId:
 *           type: string
 *           nullable: true
 *           description: ID of the template used for this configuration
 *     Conversation:
 *       type: object
 *       properties:
 *         conversation:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *             created:
 *               type: integer
 *             sId:
 *               type: string
 *               description: Unique string identifier for the conversation
 *             owner:
 *               $ref: '#/components/schemas/Workspace'
 *             title:
 *               type: string
 *               description: Title of the conversation
 *             visibility:
 *               type: string
 *               description: Visibility setting of the conversation
 *             content:
 *               type: array
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     sId:
 *                       type: string
 *                       description: Unique string identifier for the message
 *                     type:
 *                       type: string
 *                       description: Type of the message
 *                     visibility:
 *                       type: string
 *                       description: Visibility setting of the message
 *                     version:
 *                       type: integer
 *                     created:
 *                       type: integer
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     mentions:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Mention'
 *                     content:
 *                       type: string
 *                       description: Content of the message
 *                     context:
 *                       $ref: '#/components/schemas/Context'
 *                     agentMessageId:
 *                       type: integer
 *                     parentMessageId:
 *                       type: string
 *                       description: ID of the parent message
 *                     status:
 *                       type: string
 *                       description: Status of the message
 *                     actions:
 *                       type: array
 *                     chainOfThought:
 *                       type: string
 *                       nullable: true
 *                       description: Chain of thought for the message
 *                     rawContents:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           step:
 *                             type: integer
 *                           content:
 *                             type: string
 *                             description: Content for each step
 *                     error:
 *                       type: string
 *                       nullable: true
 *                       description: Error message, if any
 *                     configuration:
 *                       $ref: '#/components/schemas/AgentConfiguration'
 *     Mention:
 *       type: object
 *       properties:
 *         configurationId:
 *           type: string
 *           description: ID of the mentioned agent configuration
 *           example: dust
 *     Message:
 *       type: object
 *       properties:
 *         content:
 *           type: string
 *           description: The content of the message
 *           example: This is my message
 *         mentions:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Mention'
 *         context:
 *           $ref: '#/components/schemas/Context'
 *     ContentFragment:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *           description: The title of the content fragment
 *           example: My content fragment
 *         content:
 *           type: string
 *           description: The content of the content fragment
 *           example: This is my content fragment
 *         url:
 *           type: string
 *           description: The URL of the content fragment
 *           example: https://example.com/content
 *         contentType:
 *           type: string
 *           description: The content type of the content fragment
 *           example: text/plain
 *         context:
 *           $ref: '#/components/schemas/Context'
 *     Datasource:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Unique identifier for the datasource
 *         createdAt:
 *           type: integer
 *           description: Timestamp of when the datasource was created
 *         name:
 *           type: string
 *           description: Name of the datasource
 *         description:
 *           type: string
 *           description: Description of the datasource
 *         dustAPIProjectId:
 *           type: string
 *           description: ID of the associated Dust API project
 *         connectorId:
 *           type: string
 *           description: ID of the connector used for this datasource
 *         connectorProvider:
 *           type: string
 *           description: Provider of the connector (e.g., 'webcrawler')
 *         assistantDefaultSelected:
 *           type: boolean
 *           description: Whether this datasource is selected by default for assistants
 */
