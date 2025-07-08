# WorkOS User Analysis Script

This script analyzes WorkOS users with emails matching a specific domain and provides information about them in relation to a target organization.

## Purpose

The script helps you:

1. Find all WorkOS users with emails from a specific domain
2. Get detailed information about users and the target organization
3. Understand the current user landscape before planning organization additions
4. Prepare for user onboarding through alternative methods

## Usage

```bash
# Basic usage (dry run)
npx tsx front/migrations/20250602_add_users_to_organization.ts \
  --domain example.com \
  --organizationId org_123456789

# Execute mode (same as dry run for this script)
npx tsx front/migrations/20250602_add_users_to_organization.ts \
  --domain example.com \
  --organizationId org_123456789 \
  --execute
```

## Parameters

- `--domain` or `-d`: The domain to match user emails (e.g., "example.com")
- `--organizationId` or `-o`: The WorkOS organization ID to analyze users for
- `--execute` or `-e`: Execute mode (required for actual operations, but this script is read-only)

## Output

The script provides:

1. **Organization Information**: Name, ID, and associated domains
2. **User Analysis**: List of all users with the specified domain
3. **User Details**: Email, name, verification status, creation date
4. **Summary Statistics**: Total users found
5. **Guidance**: Options for adding users to the organization

## Example Output

```
[INFO] Starting user analysis for organization { domain: "example.com", organizationId: "org_123", execute: false }
[INFO] Retrieved organization info { organizationId: "org_123", organizationName: "Example Corp" }
[INFO] Organization details { organizationId: "org_123", organizationName: "Example Corp", domains: ["example.com"] }
[INFO] Found WorkOS users for domain { domain: "example.com", userCount: 5 }
[INFO] Found users to analyze { userCount: 5 }
[INFO] User details { userId: "user_1", email: "john@example.com", firstName: "John", lastName: "Doe", emailVerified: true, createdAt: "2024-01-01T00:00:00Z" }
[INFO] User details { userId: "user_2", email: "jane@example.com", firstName: "Jane", lastName: "Smith", emailVerified: true, createdAt: "2024-01-02T00:00:00Z" }
[INFO] Analysis completed { totalUsers: 5, organizationName: "Example Corp", organizationId: "org_123" }
[INFO] To add users to the organization, you have several options: { message: "To add users to the organization, you have several options:", options: ["1. Use WorkOS Directory Sync to automatically sync users from your identity provider", "2. Use WorkOS SSO to allow users to authenticate through your organization", "3. Manually invite users through the WorkOS dashboard", "4. Contact WorkOS support for bulk user import options"] }
```

## Important Notes

1. **Read-Only Operation**: This script only analyzes and reports - it doesn't modify any data
2. **WorkOS API Limitations**: The WorkOS SDK doesn't currently provide a direct method to add users to organizations programmatically
3. **User Organization Membership**: The script doesn't check if users are already members of the organization, as this information isn't directly available on the User object
4. **Alternative Approaches**: The script provides guidance on alternative methods for adding users to organizations

## Next Steps

After running the analysis, consider these options for adding users to the organization:

1. **Directory Sync**: Set up WorkOS Directory Sync to automatically sync users from your identity provider
2. **SSO Configuration**: Configure SSO to allow users to authenticate through your organization
3. **Manual Invitation**: Use the WorkOS dashboard to manually invite users
4. **Bulk Import**: Contact WorkOS support for bulk user import options

## Troubleshooting

- **No users found**: Verify the domain spelling and check if users exist in WorkOS
- **Organization not found**: Verify the organization ID is correct
- **API errors**: Check your WorkOS API key and permissions
