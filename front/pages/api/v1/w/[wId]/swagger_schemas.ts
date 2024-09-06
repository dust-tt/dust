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
 *           example: "0ec98sgc2f"
 *         id:
 *           type: integer
 *           example: 12345
 *         createdAt:
 *           type: integer
 *           example: 1631234567
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
 *           example: "0ec98sgc2f"
 *         name:
 *           type: string
 *           description: Name of the workspace
 *           example: "Project Alpha"
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
 *           example: ["beta_feature", "early_access"]
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
 *           example: "johndoe"
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
 *           example: "https://example.com/profile/johndoe.jpg"
 *         origin:
 *           type: string
 *           description: Origin of the context
 *           default: "api"
 *           example: "api"
 *     AgentConfiguration:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 54321
 *         sId:
 *           type: string
 *           description: Unique string identifier for the agent configuration
 *           example: "0ec98sgc2f"
 *         version:
 *           type: integer
 *           example: 2
 *         versionCreatedAt:
 *           type: string
 *           nullable: true
 *           description: Timestamp of when the version was created
 *           example: "2023-09-15T14:30:00Z"
 *         versionAuthorId:
 *           type: string
 *           nullable: true
 *           description: ID of the user who created this version
 *           example: "0ec98sgc2f"
 *         name:
 *           type: string
 *           description: Name of the agent configuration
 *           example: "Customer Support Bot"
 *         description:
 *           type: string
 *           description: Description of the agent configuration
 *           example: "An AI assistant for handling customer inquiries"
 *         instructions:
 *           type: string
 *           nullable: true
 *           description: Instructions for the agent
 *           example: "Respond to customer queries politely and accurately"
 *         pictureUrl:
 *           type: string
 *           description: URL of the agent's picture
 *           example: "https://example.com/agents/support-bot.png"
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
 *           example: "allowlist"
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
 *           example: "0ec98sgc2f"
 *     Conversation:
 *       type: object
 *       properties:
 *         conversation:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *               example: 98765
 *             created:
 *               type: integer
 *               example: 1631234567
 *             sId:
 *               type: string
 *               description: Unique string identifier for the conversation
 *               example: "0ec98sgc2f"
 *             owner:
 *               $ref: '#/components/schemas/Workspace'
 *             title:
 *               type: string
 *               description: Title of the conversation
 *               example: "Product Inquiry - Customer A"
 *             visibility:
 *               type: string
 *               description: Visibility setting of the conversation. Only 'unlisted' is accepted through the API.
 *               example: "unlisted"
 *             content:
 *               type: array
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1001
 *                     sId:
 *                       type: string
 *                       description: Unique string identifier for the message
 *                       example: "0ec98sgc2f"
 *                     type:
 *                       type: string
 *                       description: Type of the message
 *                       example: "user"
 *                     visibility:
 *                       type: string
 *                       description: Visibility setting of the message
 *                       example: "visible"
 *                     version:
 *                       type: integer
 *                       example: 1
 *                     created:
 *                       type: integer
 *                       example: 1631234568
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     mentions:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Mention'
 *                     content:
 *                       type: string
 *                       description: Content of the message
 *                       example: "Hello, I have a question about your product."
 *                     context:
 *                       $ref: '#/components/schemas/Context'
 *                     agentMessageId:
 *                       type: integer
 *                       example: 2001
 *                     parentMessageId:
 *                       type: string
 *                       description: ID of the parent message
 *                       example: "0ec98sgc2f"
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
 *                       example: "To answer your question, I need to search in your internal datasources."
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
 *                             example: "Searching in Google Drive."
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
 *           example: "0ec98sgc2f"
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
 *           example: "This is my content fragment"
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
 *     Datasource:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Unique identifier for the datasource
 *           example: 3456
 *         createdAt:
 *           type: integer
 *           description: Timestamp of when the datasource was created
 *           example: 1631234567
 *         name:
 *           type: string
 *           description: Name of the datasource
 *           example: "Product Knowledge Base"
 *         description:
 *           type: string
 *           description: Description of the datasource
 *           example: "Contains all product information and specifications"
 *         dustAPIProjectId:
 *           type: string
 *           description: ID of the associated Dust API project
 *           example: "0ec98sgc2f"
 *         connectorId:
 *           type: string
 *           description: ID of the connector used for this datasource
 *           example: "0ec98sgc2f"
 *         connectorProvider:
 *           type: string
 *           description: Provider of the connector (e.g., 'webcrawler')
 *           example: "webcrawler"
 *         assistantDefaultSelected:
 *           type: boolean
 *           description: Whether this datasource is selected by default for assistants
 *           example: true
 *     Run:
 *       type: object
 *       properties:
 *         run_id:
 *           type: string
 *           description: The ID of the run
 *           example: "0ec98sgc2f"
 *         app_id:
 *           type: string
 *           description: The ID of the app
 *           example: "0ec98sgc2f"
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
 *           example: {"output": "Hello, world!"}
 *         specification_hash:
 *           type: string
 *           description: The hash of the app specification
 *           example: "0ec98sgc2f"
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
 *                   example: 1631234567890
 *                 trace:
 *                   type: object
 *                   description: The trace
 *                   example: {"event": "start", "details": "Initializing run"}
 *     Document:
 *       type: object
 *       properties:
 *         data_source_id:
 *           type: string
 *           example: "0ec98sgc2f"
 *         created:
 *           type: number
 *           example: 1631234567
 *         document_id:
 *           type: string
 *           example: "0ec98sgc2f"
 *         timestamp:
 *           type: number
 *           example: 1631234567890
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *           example: ["product", "manual"]
 *         parents:
 *           type: array
 *           items:
 *             type: string
 *           example: ["0ec98sgc2f"]
 *         source_url:
 *           type: string
 *           nullable: true
 *           example: "https://example.com/product-manual.pdf"
 *         hash:
 *           type: string
 *           example: "0ec98sgc2f"
 *         text_size:
 *           type: number
 *           example: 15234
 *         chunk_count:
 *           type: number
 *           example: 5
 *         chunks:
 *           type: array
 *           items:
 *             type: object
 *           example: [
 *             {
 *               "chunk_id": "0ec98sgc2f",
 *               "text": "This is the first chunk of the document.",
 *               "offset": 0
 *             },
 *             {
 *               "chunk_id": "1fd99thd3g",
 *               "text": "This is the second chunk of the document.",
 *               "offset": 100
 *             }
 *           ]
 *         text:
 *           type: string
 *           example: "This is the full text content of the document..."
 *         token_count:
 *           type: number
 *           nullable: true
 *           example: 2345
 */
