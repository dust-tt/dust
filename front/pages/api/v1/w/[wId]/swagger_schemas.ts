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
 *           example: "0ec9852c2f"
 *         id:
 *           type: integer
 *           example: 12345
 *         createdAt:
 *           type: integer
 *           example: 1625097600
 *         username:
 *           type: string
 *           description: User's chosen username
 *           example: "johndoe"
 *         email:
 *           type: string
 *           description: User's email address
 *           example: "john.doe@example.com"
 *         firstName:
 *           type: string
 *           description: User's first name
 *           example: "John"
 *         lastName:
 *           type: string
 *           description: User's last name
 *           example: "Doe"
 *         fullName:
 *           type: string
 *           description: User's full name
 *           example: "John Doe"
 *         provider:
 *           type: string
 *           description: Authentication provider used by the user
 *           example: "google"
 *         image:
 *           type: string
 *           description: URL of the user's profile image
 *           example: "https://example.com/profile/johndoe.jpg"
 *     Workspace:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 67890
 *         sId:
 *           type: string
 *           description: Unique string identifier for the workspace
 *           example: "dQFf9l5FQY"
 *         name:
 *           type: string
 *           description: Name of the workspace
 *           example: "My Awesome Workspace"
 *         role:
 *           type: string
 *           description: User's role in the workspace
 *           example: "admin"
 *         segmentation:
 *           type: string
 *           nullable: true
 *           description: Segmentation information for the workspace
 *           example: "enterprise"
 *         flags:
 *           type: array
 *           items:
 *             type: string
 *             description: Feature flags enabled for the workspace
 *           example: ["advanced_analytics", "beta_features"]
 *         ssoEnforced:
 *           type: boolean
 *           example: true
 *         whiteListedProviders:
 *           type: array
 *           items:
 *             type: string
 *             description: List of allowed authentication providers
 *           example: ["google", "github"]
 *         defaultEmbeddingProvider:
 *           type: string
 *           nullable: true
 *           description: Default provider for embeddings in the workspace
 *           example: "openai"
 *     Context:
 *       type: object
 *       properties:
 *         username:
 *           type: string
 *           description: Username in the current context
 *           example: "johndoe123"
 *         timezone:
 *           type: string
 *           description: User's timezone
 *           example: "America/New_York"
 *         fullName:
 *           type: string
 *           description: User's full name in the current context
 *           example: "John Doe"
 *         email:
 *           type: string
 *           description: User's email in the current context
 *           example: "john.doe@example.com"
 *         profilePictureUrl:
 *           type: string
 *           description: URL of the user's profile picture
 *           example: "https://example.com/profiles/johndoe123.jpg"
 *         origin:
 *           type: string
 *           description: Origin of the context (contact us to add more at support@dust.tt)
 *           enum:
 *             - api
 *             - slack
 *             - gsheet
 *             - zapier
 *             - make
 *             - zendesk
 *             - raycast
 *     AgentConfiguration:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 12345
 *         sId:
 *           type: string
 *           description: Unique string identifier for the agent configuration
 *           example: "7f3a9c2b1e"
 *         version:
 *           type: integer
 *           example: 2
 *         versionCreatedAt:
 *           type: string
 *           nullable: true
 *           description: Timestamp of when the version was created
 *           example: "2023-06-15T14:30:00Z"
 *         versionAuthorId:
 *           type: string
 *           nullable: true
 *           description: ID of the user who created this version
 *           example: "0ec9852c2f"
 *         name:
 *           type: string
 *           description: Name of the agent configuration
 *           example: "Customer Support Agent"
 *         description:
 *           type: string
 *           description: Description of the agent configuration
 *           example: "An AI agent designed to handle customer support inquiries"
 *         instructions:
 *           type: string
 *           nullable: true
 *           description: Instructions for the agent
 *           example: "Always greet the customer politely and try to resolve their issue efficiently."
 *         pictureUrl:
 *           type: string
 *           description: URL of the agent's picture
 *           example: "https://example.com/agent-images/support-agent.png"
 *         status:
 *           type: string
 *           description: Current status of the agent configuration
 *           example: "active"
 *         scope:
 *           type: string
 *           description: Scope of the agent configuration
 *           example: "workspace"
 *         userListStatus:
 *           type: string
 *           description: Status of the user list for this configuration
 *           example: "all_users"
 *         model:
 *           type: object
 *           properties:
 *             providerId:
 *               type: string
 *               description: ID of the model provider
 *               example: "openai"
 *             modelId:
 *               type: string
 *               description: ID of the specific model
 *               example: "gpt-4"
 *             temperature:
 *               type: number
 *               example: 0.7
 *         actions:
 *           type: array
 *           example: []
 *         maxStepsPerRun:
 *           type: integer
 *           example: 10
 *         templateId:
 *           type: string
 *           nullable: true
 *           description: ID of the template used for this configuration
 *           example: "b4e2f1a9c7"
 *     Conversation:
 *       type: object
 *       properties:
 *         conversation:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *               example: 67890
 *             created:
 *               type: integer
 *               example: 1625097600
 *             sId:
 *               type: string
 *               description: Unique string identifier for the conversation
 *               example: "3d8f6a2c1b"
 *             owner:
 *               $ref: '#/components/schemas/Workspace'
 *             title:
 *               type: string
 *               description: Title of the conversation
 *               example: "Customer Inquiry #1234"
 *             visibility:
 *               type: string
 *               description: Visibility setting of the conversation
 *               example: "private"
 *             content:
 *               type: array
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     sId:
 *                       type: string
 *                       description: Unique string identifier for the message
 *                       example: "9e7d5c3a1f"
 *                     type:
 *                       type: string
 *                       description: Type of the message
 *                       example: "human"
 *                     visibility:
 *                       type: string
 *                       description: Visibility setting of the message
 *                       example: "visible"
 *                     version:
 *                       type: integer
 *                       example: 1
 *                     created:
 *                       type: integer
 *                       example: 1625097700
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     mentions:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Mention'
 *                     content:
 *                       type: string
 *                       description: Content of the message
 *                       example: "Hello, I need help with my order."
 *                     context:
 *                       $ref: '#/components/schemas/Context'
 *                     agentMessageId:
 *                       type: integer
 *                       example: 1
 *                     parentMessageId:
 *                       type: string
 *                       description: ID of the parent message
 *                       example: "2b8e4f6a0c"
 *                     status:
 *                       type: string
 *                       description: Status of the message
 *                       example: "completed"
 *                     actions:
 *                       type: array
 *                       example: []
 *                     chainOfThought:
 *                       type: string
 *                       nullable: true
 *                       description: Chain of thought for the message
 *                       example: "The user is asking about their order. I should first greet them and then ask for their order number."
 *                     rawContents:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           step:
 *                             type: integer
 *                             example: 1
 *                           content:
 *                             type: string
 *                             description: Content for each step
 *                             example: "Hello! I'd be happy to help you with your order. Could you please provide your order number?"
 *                     error:
 *                       type: string
 *                       nullable: true
 *                       description: Error message, if any
 *                       example: null
 *                     configuration:
 *                       $ref: '#/components/schemas/AgentConfiguration'
 *     Mention:
 *       type: object
 *       properties:
 *         configurationId:
 *           type: string
 *           description: ID of the mentioned agent configuration
 *           example: "7f3a9c2b1e"
 *     Message:
 *       type: object
 *       properties:
 *         content:
 *           type: string
 *           description: The content of the message
 *           example: "This is my message"
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
 *           example: "My content fragment"
 *         content:
 *           type: string
 *           description: The content of the content fragment
 *           example: "This is my content fragment extracted text"
 *         url:
 *           type: string
 *           description: The URL of the content fragment
 *           example: "https://example.com/content"
 *         contentType:
 *           type: string
 *           description: The content type of the content fragment
 *           example: "text/plain"
 *         context:
 *           $ref: '#/components/schemas/Context'
 *     Vault:
 *       type: object
 *       properties:
 *         sId:
 *           type: string
 *           description: Unique string identifier for the vault
 *         name:
 *           type: string
 *           description: Name of the vault
 *         kind:
 *           type: string
 *           enum: [regular, global, system, public]
 *           description: The kind of the vault
 *         groupIds:
 *           type: array
 *           items:
 *             type: string
 *           description: List of group IDs that have access to the vault
 *     Datasource:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Unique identifier for the datasource
 *           example: 12345
 *         createdAt:
 *           type: integer
 *           description: Timestamp of when the datasource was created
 *           example: 1625097600
 *         name:
 *           type: string
 *           description: Name of the datasource
 *           example: "Customer Knowledge Base"
 *         description:
 *           type: string
 *           description: Description of the datasource
 *           example: "Contains all customer-related information and FAQs"
 *         dustAPIProjectId:
 *           type: string
 *           description: ID of the associated Dust API project
 *           example: "5e9d8c7b6a"
 *         connectorId:
 *           type: string
 *           description: ID of the connector used for this datasource
 *           example: "1f3e5d7c9b"
 *         connectorProvider:
 *           type: string
 *           description: Provider of the connector (e.g., 'webcrawler')
 *           example: "webcrawler"
 *         assistantDefaultSelected:
 *           type: boolean
 *           description: Whether this datasource is selected by default for assistants
 *           example: true
 *     DatasourceView:
 *       type: object
 *       properties:
 *         category:
 *           type: string
 *           enum: [managed, folder, website, apps]
 *           description: The category of the data source view
 *         createdAt:
 *           type: number
 *           description: Timestamp of when the data source view was created
 *         dataSource:
 *           $ref: '#/components/schemas/Datasource'
 *         editedByUser:
 *           type: object
 *           description: The user who last edited the data source view
 *           properties:
 *             fullName:
 *               type: string
 *               description: Full name of the user
 *             editedAt:
 *               type: number
 *               description: Timestamp of when the data source view was last edited by the user
 *         id:
 *           type: number
 *           description: Unique identifier for the data source view
 *         kind:
 *           type: string
 *           enum: [default, custom]
 *           description: The kind of the data source view
 *         parentsIn:
 *           type: array
 *           items:
 *             type: string
 *           description: List of IDs included in this view, null if complete data source is taken
 *           nullable: true
 *         sId:
 *           type: string
 *           description: Unique string identifier for the data source view
 *         updatedAt:
 *           type: number
 *           description: Timestamp of when the data source view was last updated
 *         vaultId:
 *           type: string
 *           description: ID of the vault containing the data source view
 *     Run:
 *       type: object
 *       properties:
 *         run_id:
 *           type: string
 *           description: The ID of the run
 *           example: "4a2c6e8b0d"
 *         app_id:
 *           type: string
 *           description: The ID of the app
 *           example: "9f1d3b5a7c"
 *         status:
 *           type: object
 *           properties:
 *             run:
 *               type: string
 *               description: The status of the run
 *               example: "succeeded"
 *             build:
 *               type: string
 *               description: The status of the build
 *               example: "succeeded"
 *         results:
 *           type: object
 *           description: The results of the run
 *           example: {}
 *         specification_hash:
 *           type: string
 *           description: The hash of the app specification
 *           example: "8c0a4e6d2f"
 *         traces:
 *           type: array
 *           items:
 *             type: array
 *             items:
 *               type: object
 *               properties:
 *                 timestamp:
 *                   type: number
 *                   description: The timestamp of the trace
 *                   example: 1234567890
 *                 trace:
 *                   type: object
 *                   description: The trace
 *                   example: {}
 *     Document:
 *       type: object
 *       properties:
 *         data_source_id:
 *           type: string
 *           example: "3b7d9f1e5a"
 *         created:
 *           type: number
 *           example: 1625097600
 *         document_id:
 *           type: string
 *           example: "2c4a6e8d0f"
 *         timestamp:
 *           type: number
 *           example: 1625097600
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *           example: ["customer_support", "faq"]
 *         parents:
 *           type: array
 *           items:
 *             type: string
 *           example: ["7b9d1f3e5a", "2c4a6e8d0f"]
 *         source_url:
 *           type: string
 *           nullable: true
 *           example: "https://example.com/support/article1"
 *         hash:
 *           type: string
 *           example: "a1b2c3d4e5"
 *         text_size:
 *           type: number
 *           example: 1024
 *         chunk_count:
 *           type: number
 *           example: 5
 *         chunks:
 *           type: array
 *           items:
 *             type: object
 *           example: [
 *             {
 *               "chunk_id": "9f1d3b5a7c",
 *               "text": "This is the first chunk of the document.",
 *               "embedding": [0.1, 0.2, 0.3, 0.4]
 *             },
 *             {
 *               "chunk_id": "4a2c6e8b0d",
 *               "text": "This is the second chunk of the document.",
 *               "embedding": [0.5, 0.6, 0.7, 0.8]
 *             }
 *           ]
 *         text:
 *           type: string
 *           example: "This is the full text content of the document. It contains multiple paragraphs and covers various topics related to customer support."
 *         token_count:
 *           type: number
 *           nullable: true
 *           example: 150
 */
