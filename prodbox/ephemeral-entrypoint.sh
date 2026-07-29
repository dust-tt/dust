#!/bin/bash
# Entrypoint for the prodbox-ephemeral image used by one-off k8s Jobs (e.g.
# database migrations). It fetches the latest code from `main` so the job runs
# against up-to-date sources, then execs the command passed by the k8s Job spec
# (e.g. `npm run migration:apply:pre-deploy --workspace front`).
set -euo pipefail

DEPLOY_KEY="/etc/github-deploykey-deploybox/github-deploykey-deploybox"

if [ -f "${DEPLOY_KEY}" ]; then
  echo "Fetching latest code from origin/main..."

  # ssh refuses keys readable by others and we cannot chmod on the mounted
  # volume, so copy the key to a private location first (mirrors prodbox/init.sh).
  mkdir -p ~/.ssh
  chmod 700 ~/.ssh
  cp "${DEPLOY_KEY}" ~/.ssh/github-deploykey-deploybox
  ssh-keyscan -H github.com >> ~/.ssh/known_hosts
  chmod 600 ~/.ssh/*

  # Fast-forward only: never create a merge commit on top of the baked-in tree.
  git config pull.ff only
  git remote set-url origin git@github.com:dust-tt/dust.git
  git pull origin main
else
  echo "No deploy key mounted at ${DEPLOY_KEY}; running with code baked into the image."
fi

exec "$@"
