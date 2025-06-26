#!/bin/bash

set -euo pipefail

# Script to run action configuration migrations for workspaces that have them

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Parse command line arguments
EXECUTE_FLAG=""
DRY_RUN_MODE=true

while [[ $# -gt 0 ]]; do
    case $1 in
        --execute)
            EXECUTE_FLAG="--execute"
            DRY_RUN_MODE=false
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [--execute]"
            echo ""
            echo "Options:"
            echo "  --execute    Actually run the migrations (default is dry-run)"
            echo "  --help, -h   Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

if [ "$DRY_RUN_MODE" = true ]; then
    echo "Running in DRY-RUN mode. Use --execute to actually run migrations."
else
    echo "Running in EXECUTE mode. Migrations will be applied."
fi
echo "Running action configuration migrations..."
echo "========================================"

# Temporary files to store workspace IDs
RETRIEVAL_WORKSPACES=$(mktemp)
WEBSEARCH_WORKSPACES=$(mktemp)
BROWSE_WORKSPACES=$(mktemp)
TABLES_QUERY_WORKSPACES=$(mktemp)
DUST_APP_RUN_WORKSPACES=$(mktemp)
PROCESS_WORKSPACES=$(mktemp)

# Clean up temp files on exit
trap "rm -f $RETRIEVAL_WORKSPACES $WEBSEARCH_WORKSPACES $BROWSE_WORKSPACES $TABLES_QUERY_WORKSPACES $DUST_APP_RUN_WORKSPACES $PROCESS_WORKSPACES" EXIT

echo "Step 1: Analyzing current action configurations..."
echo

# Run the check script and parse output to extract workspace sIds
npx tsx 20250624_check_action_configurations_by_workspace.ts | while IFS= read -r line; do
    # Detect which section we're in
    if [[ "$line" == "RETRIEVAL CONFIGURATIONS:"* ]]; then
        CURRENT_TYPE="retrieval"
    elif [[ "$line" == "WEBSEARCH CONFIGURATIONS:"* ]]; then
        CURRENT_TYPE="websearch"
    elif [[ "$line" == "BROWSE CONFIGURATIONS:"* ]]; then
        CURRENT_TYPE="browse"
    elif [[ "$line" == "TABLES_QUERY CONFIGURATIONS:"* ]]; then
        CURRENT_TYPE="tables_query"
    elif [[ "$line" == "DUST_APP_RUN CONFIGURATIONS:"* ]]; then
        CURRENT_TYPE="dust_app_run"
    elif [[ "$line" == "PROCESS CONFIGURATIONS:"* ]]; then
        CURRENT_TYPE="process"
    elif [[ "$line" =~ ^[[:space:]]+([a-zA-Z0-9]+)[[:space:]]\(.*\):[[:space:]]+[0-9]+[[:space:]]configuration\(s\)$ ]]; then
        # Extract workspace sId from lines like "  workspace123 (Workspace Name): 5 configuration(s)"
        WORKSPACE_SID="${BASH_REMATCH[1]}"
        
        case "$CURRENT_TYPE" in
            retrieval)
                echo "$WORKSPACE_SID" >> "$RETRIEVAL_WORKSPACES"
                ;;
            websearch)
                echo "$WORKSPACE_SID" >> "$WEBSEARCH_WORKSPACES"
                ;;
            browse)
                echo "$WORKSPACE_SID" >> "$BROWSE_WORKSPACES"
                ;;
            tables_query)
                echo "$WORKSPACE_SID" >> "$TABLES_QUERY_WORKSPACES"
                ;;
            dust_app_run)
                echo "$WORKSPACE_SID" >> "$DUST_APP_RUN_WORKSPACES"
                ;;
            process)
                echo "$WORKSPACE_SID" >> "$PROCESS_WORKSPACES"
                ;;
        esac
    fi
done

echo
echo "Step 2: Running migrations for each action type..."
echo

# Function to run migration for a list of workspaces
run_migration() {
    local migration_script="$1"
    local workspace_file="$2"
    local action_type="$3"
    
    if [ ! -f "$migration_script" ]; then
        echo "  Migration script not found: $migration_script"
        return
    fi
    
    local workspace_count=$(wc -l < "$workspace_file" 2>/dev/null || echo "0")
    
    if [ "$workspace_count" -eq 0 ]; then
        echo "  No workspaces with $action_type configurations to migrate"
        return
    fi
    
    echo "  Migrating $workspace_count workspace(s) with $action_type configurations..."
    
    while IFS= read -r workspace_sid; do
        if [ -n "$workspace_sid" ]; then
            echo "    Processing workspace: $workspace_sid"
            npx tsx "$migration_script" --workspaceSid="$workspace_sid" $EXECUTE_FLAG
        fi
    done < "$workspace_file"
    
    echo "  Completed $action_type migrations"
    echo
}

# Function to run migration with specific workspace argument
run_migration_with_arg() {
    local migration_script="$1"
    local workspace_file="$2"
    local action_type="$3"
    local workspace_arg="$4"
    
    if [ ! -f "$migration_script" ]; then
        echo "  Migration script not found: $migration_script"
        return
    fi
    
    local workspace_count=$(wc -l < "$workspace_file" 2>/dev/null || echo "0")
    
    if [ "$workspace_count" -eq 0 ]; then
        echo "  No workspaces with $action_type configurations to migrate"
        return
    fi
    
    echo "  Migrating $workspace_count workspace(s) with $action_type configurations..."
    
    while IFS= read -r workspace_sid; do
        if [ -n "$workspace_sid" ]; then
            echo "    Processing workspace: $workspace_sid"
            npx tsx "$migration_script" --${workspace_arg}="$workspace_sid" $EXECUTE_FLAG
        fi
    done < "$workspace_file"
    
    echo "  Completed $action_type migrations"
    echo
}

# Run migrations for each action type

echo "Migrating RETRIEVAL configurations..."
run_migration_with_arg "20250516_migrate_retrieval_to_mcp.ts" "$RETRIEVAL_WORKSPACES" "retrieval" "workspaceId"

echo "Migrating WEBSEARCH and BROWSE configurations..."
# Note: websearch and browse are handled by the same migration script
cat "$WEBSEARCH_WORKSPACES" "$BROWSE_WORKSPACES" | sort -u > "${WEBSEARCH_WORKSPACES}.combined"
run_migration_with_arg "20250513_migrate_browse_websearch_to_mcp.ts" "${WEBSEARCH_WORKSPACES}.combined" "websearch/browse" "workspaceSid"
rm -f "${WEBSEARCH_WORKSPACES}.combined"

echo "Migrating TABLES_QUERY configurations..."
run_migration_with_arg "20250514_migrate_tables_query_to_mcp.ts" "$TABLES_QUERY_WORKSPACES" "tables_query" "wId"

echo "Migrating DUST_APP_RUN configurations..."
run_migration_with_arg "20250521_migrate_dust_app_mcp.ts" "$DUST_APP_RUN_WORKSPACES" "dust_app_run" "workspaceId"

echo "Migrating PROCESS/EXTRACT configurations..."
run_migration_with_arg "20250526_migrate_extract_to_mcp.ts" "$PROCESS_WORKSPACES" "process" "workspaceId"

echo
echo "All migrations completed!"
echo

# Final check
echo "Running final check to verify migrations..."
npx tsx 20250624_check_action_configurations_by_workspace.ts