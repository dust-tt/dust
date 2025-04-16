# Changelog

All notable changes to the MCP Dust Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial implementation of the MCP Dust Server
- Core MCP server structure
- DustService class for interacting with the Dust API
- Authentication system for API key validation
- Permission proxy for access control
- Event bridge for connecting Dust events with MCP notifications
- API reflection layer for mapping Dust's API to MCP resources and tools
- Resource hierarchy for organizing Dust resources
- Workspace integration for managing workspaces
- Agent integration for executing agents
- Knowledge base integration for searching knowledge bases
- Connector integration for syncing connectors
- Error handling and logging
- Documentation

## [0.1.0] - 2023-06-01

### Added

- Initial project setup
- Basic server structure
- Environment configuration
- Logging infrastructure
- Error handling middleware
- Health check endpoint

## [0.2.0] - 2023-06-15

### Added

- DustService class for interacting with the Dust API
- Authentication system for API key validation
- Session management for MCP clients
- Basic MCP protocol implementation

### Changed

- Improved error handling
- Enhanced logging

## [0.3.0] - 2023-07-01

### Added

- Permission proxy for access control
- Event bridge for connecting Dust events with MCP notifications
- API reflection layer for mapping Dust's API to MCP resources and tools
- Resource hierarchy for organizing Dust resources

### Changed

- Refactored authentication system
- Improved session management
- Enhanced error handling

## [0.4.0] - 2023-07-15

### Added

- Workspace integration for managing workspaces
- Agent integration for executing agents
- Knowledge base integration for searching knowledge bases
- Connector integration for syncing connectors

### Changed

- Enhanced resource hierarchy
- Improved API reflection layer
- Refactored event bridge

## [0.5.0] - 2023-08-01

### Added

- Comprehensive error handling and logging
- Detailed documentation
- Unit and integration tests
- Docker support
- CI/CD pipeline

### Changed

- Refactored codebase for better maintainability
- Improved performance
- Enhanced security

## [1.0.0] - 2023-08-15

### Added

- Production-ready features
- Comprehensive documentation
- Full test coverage
- Performance optimizations
- Security enhancements

### Changed

- Finalized API
- Stabilized codebase
- Improved error handling
- Enhanced logging
