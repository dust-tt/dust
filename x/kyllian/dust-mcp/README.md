# Dust MCP Server

A Model Context Protocol (MCP) server that provides access to Dust AI agents through a standardized interface.

## Features

- **CLI Interface**: Command-line interface for server management and authentication
- **Authentication Handling**: Secure authentication flow with Auth0
- **Automatic Agent Discovery**: Automatically discovers and registers all available Dust agents as MCP tools
- **Conversation Management**: Maintains conversation context across multiple interactions with agents

## Tools

Each Dust agent in your workspace is automatically registered as an MCP tool with the following parameters:

- `message` (string, required): Message to send to the agent
- `conversationId` (string, optional): Existing conversation ID - must be provided to continue a conversation

The response from each tool includes the agent's response and the conversation ID.
