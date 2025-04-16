# MCP Dust Server Security Guide

This document provides an overview of the security features implemented in the MCP Dust Server and best practices for secure deployment and operation.

## Table of Contents

- [Security Features](#security-features)
- [Authentication and Authorization](#authentication-and-authorization)
- [Data Protection](#data-protection)
- [Input Validation](#input-validation)
- [Rate Limiting](#rate-limiting)
- [Secure Headers](#secure-headers)
- [CSRF Protection](#csrf-protection)
- [Session Management](#session-management)
- [Logging and Monitoring](#logging-and-monitoring)
- [Secure Deployment](#secure-deployment)
- [Security Best Practices](#security-best-practices)
- [Security Checklist](#security-checklist)

## Security Features

The MCP Dust Server implements the following security features:

- **Authentication**: API key validation and JWT token-based authentication
- **Authorization**: Permission-based access control for resources and tools
- **Data Protection**: Encryption of sensitive data and secure storage
- **Input Validation**: Comprehensive validation of all user inputs
- **Rate Limiting**: Protection against brute force and DoS attacks
- **Secure Headers**: Protection against common web vulnerabilities
- **CSRF Protection**: Prevention of cross-site request forgery attacks
- **Session Management**: Secure session handling and expiration
- **Logging and Monitoring**: Comprehensive security event logging
- **Secure Deployment**: Guidelines for secure deployment and operation

## Authentication and Authorization

### API Key Authentication

The MCP Dust Server uses API key authentication for initial authentication. API keys are validated against the Dust API and must meet the following requirements:

- Minimum length of 32 characters
- Maximum length of 64 characters
- Alphanumeric characters only (a-z, A-Z, 0-9, _, -)

API keys should be kept secure and never shared or exposed in client-side code, URLs, or logs.

### JWT Token Authentication

After successful API key authentication, the server issues a JWT token for subsequent requests. JWT tokens include the following claims:

- `userId`: User ID
- `username`: Username
- `email`: Email address
- `workspaceId`: Workspace ID
- `permissions`: User permissions
- `tokenId`: Unique token ID
- `iat`: Issued at timestamp
- `exp`: Expiration timestamp

JWT tokens are signed using HMAC-SHA256 (HS256) with a secure secret key and have a default expiration time of 1 hour.

### Permission-Based Authorization

The server implements permission-based authorization for all resources and tools. Permissions are checked at multiple levels:

1. **Resource Level**: Permissions for accessing resources (workspaces, agents, knowledge bases, etc.)
2. **Tool Level**: Permissions for executing tools (agent execution, knowledge base search, etc.)
3. **Operation Level**: Permissions for specific operations (read, write, delete, etc.)

Permissions are defined in the `Permission` enum and checked by the `PermissionProxy` class.

## Data Protection

### Sensitive Data Handling

Sensitive data, such as API keys and passwords, are:

- Never logged in plain text
- Never stored in plain text
- Never exposed in error messages
- Never included in responses

The `Security.maskSensitiveData()` method is used to redact sensitive data in logs and error messages.

### Secure Storage

Sensitive data is stored securely:

- API keys are stored in environment variables
- JWT tokens are stored in HTTP-only cookies
- Session data is stored in memory (or a secure session store in production)

### Secure Communication

All communication with the server should be over HTTPS in production. The server sets the following headers to enforce secure communication:

- `Strict-Transport-Security`: Enforces HTTPS
- `Content-Security-Policy`: Restricts content sources
- `Referrer-Policy`: Controls referrer information
- `X-Content-Type-Options`: Prevents MIME type sniffing
- `X-Frame-Options`: Prevents clickjacking
- `X-XSS-Protection`: Provides XSS protection

## Input Validation

### Request Validation

All request parameters, headers, and body data are validated before processing:

- API keys are validated for format and authenticity
- JWT tokens are validated for signature and expiration
- Request parameters are validated for type and format
- Request body data is validated for structure and content

### SQL Injection Prevention

The `SQLInjectionPrevention` utility is used to detect and prevent SQL injection attacks:

- Detects common SQL injection patterns
- Sanitizes input to prevent SQL injection
- Validates input before processing
- Logs potential SQL injection attempts

### XSS Prevention

The server implements multiple layers of XSS protection:

- Content-Security-Policy header restricts script execution
- X-XSS-Protection header enables browser XSS protection
- Input validation sanitizes potentially dangerous input
- Output encoding prevents script execution in responses

## Rate Limiting

The server implements rate limiting to prevent abuse:

- Limits the number of requests per IP address
- Configurable limit and window size
- Includes rate limit headers in responses
- Logs rate limit exceeded events

Rate limiting is implemented using the `createRateLimitMiddleware` function with the following default settings:

- 100 requests per hour per IP address
- Rate limit headers included in responses
- Health check endpoints excluded from rate limiting

## Secure Headers

The server sets the following security headers:

- **Content-Security-Policy**: Restricts content sources
- **X-XSS-Protection**: Enables browser XSS protection
- **X-Content-Type-Options**: Prevents MIME type sniffing
- **X-Frame-Options**: Prevents clickjacking
- **Strict-Transport-Security**: Enforces HTTPS
- **Referrer-Policy**: Controls referrer information
- **Permissions-Policy**: Restricts browser features
- **Cache-Control**: Prevents caching of sensitive data
- **Expect-CT**: Enforces Certificate Transparency

Secure headers are implemented using the `createSecureHeadersMiddleware` function.

## CSRF Protection

The server implements CSRF protection for all state-changing requests:

- CSRF token generated for each session
- Token stored in a cookie and required in request headers
- Token validated for all state-changing requests (POST, PUT, PATCH, DELETE)
- Token expires after 1 hour

CSRF protection is implemented using the `createCSRFMiddleware` function with the following settings:

- Cookie name: `XSRF-TOKEN`
- Header name: `X-XSRF-TOKEN`
- Token expiration: 1 hour
- Protected methods: POST, PUT, PATCH, DELETE
- Authentication endpoints excluded from CSRF protection

## Session Management

The server implements secure session management:

- Session ID generated using a cryptographically secure random number generator
- Session data stored securely
- Session expires after 1 hour of inactivity
- Session cookies are HTTP-only and secure
- Session cookies use SameSite=Lax to prevent CSRF

Session management is implemented using the `createSessionMiddleware` function with the following settings:

- Session name: `mcp.sid`
- Session expiration: 1 hour
- HTTP-only cookies
- Secure cookies in production
- SameSite=Lax cookies

## Logging and Monitoring

The server implements comprehensive security event logging:

- Authentication success and failure events
- Authorization failure events
- Rate limit exceeded events
- Invalid input events
- Suspicious activity events
- Session creation and invalidation events
- Resource access and modification events

Security events are logged using the `SecurityAudit` utility with the following information:

- Event type
- Event severity
- Event message
- User ID and username
- Session ID
- IP address
- User agent
- Request path and method
- Resource ID and type
- Action and result
- Additional data

## Secure Deployment

### Environment Variables

The following environment variables should be set for secure deployment:

- `NODE_ENV`: Set to `production` in production
- `SECURITY_SECRET_KEY`: Strong random secret key for JWT tokens
- `SECURITY_TOKEN_EXPIRATION`: Token expiration time in seconds
- `SESSION_TTL`: Session time-to-live in milliseconds
- `CORS_ALLOWED_ORIGINS`: Comma-separated list of allowed origins
- `LOG_LEVEL`: Set to `info` or higher in production
- `LOG_REQUEST_BODY`: Set to `false` in production
- `LOG_REQUEST_HEADERS`: Set to `false` in production
- `LOG_RESPONSE_BODY`: Set to `false` in production
- `LOG_RESPONSE_HEADERS`: Set to `false` in production

### HTTPS

The server should be deployed behind a reverse proxy (such as Nginx or Apache) that terminates HTTPS:

- Use a valid SSL/TLS certificate
- Configure HTTPS with modern cipher suites
- Enable HTTP/2
- Redirect HTTP to HTTPS
- Set secure headers

### Docker

If deploying with Docker, follow these security best practices:

- Use a minimal base image
- Run as a non-root user
- Use multi-stage builds
- Scan images for vulnerabilities
- Use read-only file systems where possible
- Limit container resources
- Use Docker secrets for sensitive data

## Security Best Practices

### API Key Management

- Generate strong API keys
- Rotate API keys regularly
- Revoke unused or compromised API keys
- Store API keys securely
- Never expose API keys in client-side code or URLs

### Password Management

- Use strong passwords
- Enforce password complexity requirements
- Implement account lockout after failed attempts
- Require password rotation for sensitive accounts
- Use multi-factor authentication where possible

### Code Security

- Keep dependencies up to date
- Scan code for vulnerabilities
- Follow secure coding practices
- Use static analysis tools
- Conduct regular security reviews

### Operational Security

- Monitor logs for suspicious activity
- Implement alerting for security events
- Conduct regular security assessments
- Have an incident response plan
- Keep systems patched and updated

## Security Checklist

Use this checklist to ensure your MCP Dust Server deployment is secure:

- [ ] Environment variables are set correctly
- [ ] HTTPS is configured properly
- [ ] API keys are strong and secure
- [ ] JWT secret key is strong and secure
- [ ] Rate limiting is enabled
- [ ] CSRF protection is enabled
- [ ] Secure headers are enabled
- [ ] Session management is secure
- [ ] Logging is configured properly
- [ ] Dependencies are up to date
- [ ] Code has been scanned for vulnerabilities
- [ ] Security best practices are followed
- [ ] Monitoring and alerting are in place
- [ ] Incident response plan is in place
