# Dust Development Environment Setup

This project uses [Devbox](https://www.jetify.com/devbox) and [direnv](https://direnv.net/) for reproducible development
environments.

## Prerequisites

- Docker (for Elasticsearch only)

## Quick Start

1. **Install Devbox**:
   ```bash
   curl -fsSL https://get.jetify.com/devbox | bash
   ```

2. **Install direnv**:
   ```bash
   # macOS
   brew install direnv

   # Add to your shell (zsh)
   echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc
   source ~/.zshrc
   ```

3. **Clone and setup**:
   ```bash
   git clone <repo-url>
   cd dust
   direnv allow  # Allow direnv to load environment
   devbox shell  # Enter devbox environment
   ```

4. **Initialize databases and dependencies**:
   ```bash
   devbox run setup
   ```

5. **Start all services**:
   ```bash
   # Single command starts everything (including Elasticsearch via Docker)
   devbox services up
   ```

6. **Verify everything is running**:
    - Front: http://localhost:3000
    - Temporal UI: http://localhost:8233
    - Elasticsearch: http://localhost:9200
    - Qdrant: http://localhost:6333

## Common Commands

```bash
# Enter devbox shell
devbox shell

# Start all services (interactive TUI) - includes Elasticsearch
devbox services up

# Start services in background
devbox services up -b

# Stop all services (including Elasticsearch)
devbox services stop

# List available services
devbox services ls

# Run setup script
devbox run setup

# View logs
tail -f .devbox/logs/front.log
tail -f .devbox/logs/core.log
tail -f .devbox/logs/elasticsearch.log

# Clean everything
devbox services stop
rm -rf .devbox/data
docker compose down -v
```

## Service Ports

| Service         | Port | URL                                 |
|-----------------|------|-------------------------------------|
| Front (Next.js) | 3000 | http://localhost:3000               |
| Core API        | 3001 | http://localhost:3001               |
| Connectors      | 3002 | http://localhost:3002               |
| PostgreSQL      | 5432 | postgresql://dev:dev@localhost:5432 |
| Redis           | 6379 | redis://localhost:6379              |
| Elasticsearch   | 9200 | http://localhost:9200               |
| Qdrant          | 6333 | http://localhost:6333               |
| Temporal        | 7233 | localhost:7233                      |
| Temporal UI     | 8233 | http://localhost:8233               |

## Troubleshooting

### Services won't start

```bash
# Check service status
devbox services ls

# View service logs
devbox services attach

# Restart a specific service
devbox services restart <service-name>
```

### PostgreSQL connection issues

```bash
# Check if PostgreSQL is running
pg_isready -h localhost -p 5432 -U dev

# Reinitialize databases
devbox run setup
```

### Elasticsearch issues

```bash
# Check container status
docker compose ps

# View logs
docker compose logs elasticsearch

# Rebuild
docker compose down -v
docker compose up elasticsearch -d
```

### Node/Rust version issues

```bash
# Verify versions
node --version  # Should be 20.19.2
rustc --version

# Regenerate environment
devbox shell --refresh
```

## Migration from mprocs

If you're migrating from the old mprocs setup:

1. Stop all services:
   ```bash
   # Kill mprocs
   pkill mprocs

   # Stop old Docker Compose
   cd /path/to/old/docker-compose
   docker compose down
   ```

2. Follow the Quick Start above

3. Main differences:
    - No need to manually install Node/Rust
    - No separate docker-compose for Temporal (using CLI dev mode)
    - Single `process-compose.yaml` instead of `mprocs.yaml`
    - Automatic environment loading via direnv

## Advanced

### Adding new packages

```bash
devbox add <package>@<version>
```

### Modifying service configuration

Edit `process-compose.yaml` and restart services.

### Environment variables

Edit `devbox.json` under `env` section, or create `.env.local` for local overrides.
