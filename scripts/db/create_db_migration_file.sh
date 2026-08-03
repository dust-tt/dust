#!/bin/bash

echo ""
echo "ERROR: migrations/db/ is frozen. Do not add files here."
echo ""
echo "Use the new phased migration system instead:"
echo ""
echo "  Safe schema additions (add column, table, index):"
echo "    npm run migration:generate:pre-deploy <description words>"
echo ""
echo "  Breaking schema changes (drop column, tighten constraint):"
echo "    npm run migration:generate:post-deploy <description words>"
echo ""
echo "See the runbook for full instructions:"
echo "  https://app.notion.com/p/dust-tt/Runbook-Deploy-Run-migrations-5669e328475d489ba16298a77f2aa45c?source=copy_link#36728599d94180898358cf59a8725740"
echo ""

exit 1
