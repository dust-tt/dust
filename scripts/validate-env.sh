#!/usr/bin/env bash
set -euo pipefail

echo "🔍 Validating Dust Development Environment"
echo ""

FAILED=0

check_command() {
  local cmd=$1
  local name=$2
  if command -v $cmd &> /dev/null; then
    echo "✅ $name: $(command -v $cmd)"
  else
    echo "❌ $name: NOT FOUND"
    FAILED=1
  fi
}

check_port() {
  local port=$1
  local name=$2
  if nc -z localhost $port 2>/dev/null; then
    echo "✅ $name: Port $port is open"
  else
    echo "❌ $name: Port $port is closed"
    FAILED=1
  fi
}

check_env_var() {
  local var=$1
  if [ -n "${!var:-}" ]; then
    echo "✅ $var is set"
  else
    echo "❌ $var is NOT set"
    FAILED=1
  fi
}

echo "## Checking Commands"
check_command devbox "Devbox"
check_command direnv "direnv"
check_command node "Node.js"
check_command npm "npm"
check_command cargo "Cargo"
check_command rustc "Rust"
check_command psql "PostgreSQL Client"
check_command redis-cli "Redis Client"
check_command docker "Docker"

echo ""
echo "## Checking Ports"
check_port 5432 "PostgreSQL"
check_port 6379 "Redis"
check_port 9200 "Elasticsearch"
check_port 6333 "Qdrant"
check_port 7233 "Temporal"
check_port 8233 "Temporal UI"

echo ""
echo "## Checking Environment Variables"
check_env_var "FRONT_DATABASE_URI"
check_env_var "CONNECTORS_DATABASE_URI"
check_env_var "REDIS_URI"
check_env_var "TEMPORAL_ADDRESS"

echo ""
echo "## Checking Services"

# PostgreSQL
if pg_isready -h localhost -p 5432 -U dev &>/dev/null; then
  echo "✅ PostgreSQL is accepting connections"
else
  echo "❌ PostgreSQL is not accepting connections"
  FAILED=1
fi

# Redis
if redis-cli -h localhost -p 6379 ping &>/dev/null | grep -q PONG; then
  echo "✅ Redis is responding"
else
  echo "❌ Redis is not responding"
  FAILED=1
fi

# Elasticsearch
if curl -sf -u elastic:changeme http://localhost:9200 &>/dev/null; then
  echo "✅ Elasticsearch is responding"
else
  echo "❌ Elasticsearch is not responding"
  FAILED=1
fi

# Qdrant
if curl -sf http://localhost:6333/healthz &>/dev/null; then
  echo "✅ Qdrant is healthy"
else
  echo "❌ Qdrant is not healthy"
  FAILED=1
fi

# Temporal
if curl -sf http://localhost:8233 &>/dev/null; then
  echo "✅ Temporal UI is responding"
else
  echo "❌ Temporal UI is not responding"
  FAILED=1
fi

echo ""
if [ $FAILED -eq 0 ]; then
  echo "🎉 All checks passed!"
  exit 0
else
  echo "⚠️  Some checks failed"
  exit 1
fi
