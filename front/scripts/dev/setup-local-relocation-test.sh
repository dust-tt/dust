#!/bin/bash
set -e

# Save the script's directory and initial working directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${SCRIPT_DIR}/backups"

# Configuration
FRONT_DIR="${FRONT_DIR:-$(pwd)}"
CONNECTORS_DIR="${CONNECTORS_DIR:-$(cd ../connectors && pwd)}"
CORE_DIR="${CORE_DIR:-$(cd ../core && pwd)}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1" >&2; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1" >&2; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# Validate prerequisites
validate_prerequisites() {
    log_info "Validating prerequisites..."

    : ${DUST_APPS_WORKSPACE_ID:?"ERROR: DUST_APPS_WORKSPACE_ID not set (your US dust-apps workspace)"}
    : ${DUST_APPS_SPACE_ID:?"ERROR: DUST_APPS_SPACE_ID not set (your US dust-apps space)"}

    # Check if we can get an API key or if one is provided
    if [ -z "${DUST_APPS_API_KEY}" ]; then
        log_warn "DUST_APPS_API_KEY not set - will try to create one"
    fi

    log_info "Prerequisites validated"
}

# EU-specific environment variables
export DUST_RELOCATION_BUCKET=dust-relocations-test
export DUST_PRIVATE_UPLOADS_BUCKET_EU=dust-private-uploads-test-europe
export DUST_UPLOAD_BUCKET_EU=dust-public-uploads-test-europe

# Helper to create database if it doesn't exist
create_db_if_not_exists() {
    local DB_NAME=$1
    local EXISTS=$(psql "postgres://dev:dev@localhost:5432/postgres" -tAc \
        "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'")

    if [ "$EXISTS" = "1" ]; then
        log_warn "Database ${DB_NAME} already exists, skipping"
    else
        psql "postgres://dev:dev@localhost:5432/postgres" -c "CREATE DATABASE ${DB_NAME};" > /dev/null
        log_info "Created database ${DB_NAME}"
    fi
}

# Create EU databases
create_eu_databases() {
    log_info "Creating EU databases..."
    create_db_if_not_exists "dust_front_eu"
    create_db_if_not_exists "dust_connectors_eu"
    create_db_if_not_exists "dust_api_eu"
}

# Initialize EU databases
init_eu_databases() {
    log_info "Initializing EU Front database..."
    cd "$FRONT_DIR"
    DUST_PRIVATE_UPLOADS_BUCKET=$DUST_PRIVATE_UPLOADS_BUCKET_EU \
    DUST_UPLOAD_BUCKET=$DUST_UPLOAD_BUCKET_EU \
    FRONT_DATABASE_URI=postgres://dev:dev@localhost:5432/dust_front_eu \
    ./admin/init_db.sh --unsafe > /dev/null 2>&1

    log_info "Initializing EU Connectors database..."
    cd "$CONNECTORS_DIR"
    DUST_PRIVATE_UPLOADS_BUCKET=$DUST_PRIVATE_UPLOADS_BUCKET_EU \
    DUST_UPLOAD_BUCKET=$DUST_UPLOAD_BUCKET_EU \
    CONNECTORS_DATABASE_URI=postgres://dev:dev@localhost:5432/dust_connectors_eu \
    ./admin/init_db.sh --unsafe > /dev/null 2>&1

    log_info "Initializing EU Core database..."
    cd "$CORE_DIR"
    CORE_DATABASE_URI=postgres://dev:dev@localhost:5432/dust_api_eu \
    cargo run --bin init_db > /dev/null 2>&1
}

# Get the system key from the LOCAL US dust-apps workspace
get_or_create_api_key() {
    if [ -n "${DUST_APPS_API_KEY}" ]; then
        echo "${DUST_APPS_API_KEY}"
        return
    fi

    log_info "Getting API key for dust apps sync (workspaceId: $DUST_APPS_WORKSPACE_ID)..."
    cd "$FRONT_DIR"

    cat > /tmp/get_system_key.ts << 'EOF'
import { Authenticator, getOrCreateSystemApiKey } from "@app/lib/auth";

async function main() {
  const workspaceId = process.env.DUST_APPS_WORKSPACE_ID!;

  if (!workspaceId) {
    throw new Error("DUST_APPS_WORKSPACE_ID not set");
  }

  console.error(`Fetching system key for workspace: ${workspaceId}`);

  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const systemKey = await getOrCreateSystemApiKey(auth.getNonNullableWorkspace());

  if (!systemKey) {
    throw new Error("No system key found for workspace");
  }

  // Only output the key to stdout
  console.log(systemKey.secret);
}

main().catch((err) => {
  console.error("An error occurred:", err);
  process.exit(1);
});
EOF

    # Capture stdout (the key) separately from stderr (logs/errors)
    local API_KEY=$(DUST_APPS_WORKSPACE_ID=$DUST_APPS_WORKSPACE_ID \
        FRONT_DATABASE_URI=postgres://dev:dev@localhost:5432/dust_front \
        npx tsx /tmp/get_system_key.ts 2>&1 >(grep -v "^sk-" >&2) | grep "^sk-" || true)

    rm /tmp/get_system_key.ts

    if [[ ! "$API_KEY" =~ ^sk- ]]; then
        log_error "Failed to get system key"
        exit 1
    fi

    log_info "Got system key successfully"
    echo "$API_KEY"
}

# Initialize Dust Apps workspace in EU and capture IDs
init_dust_apps_eu() {
    log_info "Creating dust-apps workspace in EU region..."
    cd "$FRONT_DIR"

    # Use existing script with EU database
    local OUTPUT=$(FRONT_DATABASE_URI=postgres://dev:dev@localhost:5432/dust_front_eu \
    DUST_PRIVATE_UPLOADS_BUCKET=$DUST_PRIVATE_UPLOADS_BUCKET_EU \
    DUST_UPLOAD_BUCKET=$DUST_UPLOAD_BUCKET_EU \
    npx tsx ./admin/init_dust_apps.ts --name dust-apps-eu 2>&1)

    # Parse the output - it prints: export DUST_APPS_WORKSPACE_ID=xxx
    local EU_WORKSPACE_ID=$(echo "$OUTPUT" | grep "DUST_APPS_WORKSPACE_ID=" | cut -d= -f2)
    local EU_SPACE_ID=$(echo "$OUTPUT" | grep "DUST_APPS_SPACE_ID=" | cut -d= -f2)

    if [ -z "$EU_WORKSPACE_ID" ] || [ -z "$EU_SPACE_ID" ]; then
        log_error "Failed to create dust-apps workspace in EU"
        log_error "Output was:"
        echo "$OUTPUT"
        # This does not seem to exit the entire script.
        exit 1
    fi

    log_info "Created dust-apps workspace: $EU_WORKSPACE_ID"
    log_info "Created public space: $EU_SPACE_ID"

    # Return the values
    echo "$EU_WORKSPACE_ID $EU_SPACE_ID"
}


# Sync dust apps from US to EU using poke plugin
sync_dust_apps() {
    local WORKSPACE_ID=$1
    local SPACE_ID=$2

    log_info "Syncing Dust Apps from US to EU..."
    log_info "From Region: US"
    log_info "Workspace ID: $DUST_APPS_WORKSPACE_ID"
    log_info "Space ID: $DUST_APPS_SPACE_ID"
    log_info "To Region: EU"
    log_info "Workspace ID: $WORKSPACE_ID"
    log_info "Space ID: $SPACE_ID"
    cd "$FRONT_DIR"

    local API_KEY=$(get_or_create_api_key)

    # Run the poke plugin directly
    FRONT_DATABASE_URI=postgres://dev:dev@localhost:5432/dust_front_eu \
    CORE_DATABASE_URI=postgres://dev:dev@localhost:5432/dust_api_eu \
    DUST_APPS_SYNC_MASTER_WORKSPACE_ID=$DUST_APPS_WORKSPACE_ID \
    DUST_APPS_SYNC_MASTER_SPACE_ID=$DUST_APPS_SPACE_ID \
    DUST_APPS_SYNC_MASTER_API_KEY=$API_KEY \
    DUST_US_URL="http://localhost:3000" \
    DUST_REGION=europe-west1 \
    npx tsx ./scripts/run_poke_plugins.ts \
        --plugin sync-apps \
        --resourceType spaces \
        --wId "$WORKSPACE_ID" \
        --resourceId "$SPACE_ID" \
        --args '{}' \
        --execute

    log_info "✅ Dust apps synced"
}

# Backup US databases
backup_us_databases() {
    log_info "Backing up US databases..."
    mkdir -p "$BACKUP_DIR"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)

    docker exec -i dust-db-1 /usr/local/bin/pg_dump -U dev -Fc dust_front > "${BACKUP_DIR}/dust_front_${TIMESTAMP}.custom" 2>/dev/null
    docker exec -i dust-db-1 /usr/local/bin/pg_dump -U dev -Fc dust_connectors > "${BACKUP_DIR}/dust_connectors_${TIMESTAMP}.custom" 2>/dev/null
    docker exec -i dust-db-1 /usr/local/bin/pg_dump -U dev -Fc dust_api > "${BACKUP_DIR}/dust_api_${TIMESTAMP}.custom" 2>/dev/null

    echo "$TIMESTAMP" > "${BACKUP_DIR}/latest_backup.txt"
    log_info "Backups saved to: $BACKUP_DIR/$TIMESTAMP"
}

# Save configuration for future use
save_config() {
    local WORKSPACE_ID=$1
    local SPACE_ID=$2

    cat > "${SCRIPT_DIR}/.relocation-test-config" << EOF
# Configuration for local relocation testing
# Generated on $(date)

# US Region (Source)
export DUST_APPS_WORKSPACE_ID=$DUST_APPS_WORKSPACE_ID
export DUST_APPS_SPACE_ID=$DUST_APPS_SPACE_ID

# EU Region (Destination)
export DUST_APPS_WORKSPACE_ID_EU=$WORKSPACE_ID
export DUST_APPS_SPACE_ID_EU=$SPACE_ID

# Buckets
export DUST_PRIVATE_UPLOADS_BUCKET_EU=$DUST_PRIVATE_UPLOADS_BUCKET_EU
export DUST_UPLOAD_BUCKET_EU=$DUST_UPLOAD_BUCKET_EU

# Database URIs
export FRONT_DATABASE_URI_EU=postgres://dev:dev@localhost:5432/dust_front_eu
export CONNECTORS_DATABASE_URI_EU=postgres://dev:dev@localhost:5432/dust_connectors_eu
export CORE_DATABASE_URI_EU=postgres://dev:dev@localhost:5432/dust_api_eu

# Backup directory
export BACKUP_DIR=$BACKUP_DIR
EOF

    log_info "Configuration saved to ${SCRIPT_DIR}/.relocation-test-config"
}

# Main execution
main() {
    log_info "=========================================="
    log_info "Local Relocation Test Setup"
    log_info "=========================================="
    echo ""

    validate_prerequisites

    log_info "Step 1/6: Creating EU databases..."
    create_eu_databases

    log_info "Step 2/6: Initializing EU databases..."
    init_eu_databases

    log_info "Step 3/6: Backing up US databases..."
    backup_us_databases

    log_info "Step 4/6: Creating dust-apps workspace in EU..."

    local EU_IDS=$(init_dust_apps_eu)
    local EU_WORKSPACE_ID=$(echo $EU_IDS | cut -d' ' -f1)
    local EU_SPACE_ID=$(echo $EU_IDS | cut -d' ' -f2)

    log_info "Step 5/6: Syncing dust apps from US to EU..."
    sync_dust_apps "$EU_WORKSPACE_ID" "$EU_SPACE_ID"

    log_info "Step 6/6: Saving configuration..."
    save_config "$EU_WORKSPACE_ID" "$EU_SPACE_ID"

    echo ""
    log_info "=========================================="
    log_info "✅ Setup Complete!"
    log_info "=========================================="
    echo ""
    log_info "EU Region Configuration:"
    echo "  Workspace: $DUST_APPS_WORKSPACE_ID_EU"
    echo "  Space: $DUST_APPS_SPACE_ID_EU"
    echo ""
    log_info "Next steps:"
    echo "  1. Source config: source .relocation-test-config"
    echo "  2. Create test workspace at http://localhost:3000"
    echo "  3. Run relocation: ./run-relocation-test.sh <workspace_id>"
    echo ""
    log_info "To clean up: ./cleanup-relocation-test.sh"
}

main "$@"