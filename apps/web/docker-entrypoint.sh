#!/bin/sh
set -e

echo "========================================"
echo "  Quackback starting..."
echo "========================================"

# Migrations: skipped in K8s where a pre-upgrade Helm hook Job runs them
# before pods roll. Set SKIP_MIGRATIONS=true to opt out of the on-start
# migration step. Default behavior matches `docker run` ergonomics.
if [ "$SKIP_MIGRATIONS" = "true" ]; then
  echo ""
  echo "SKIP_MIGRATIONS=true — skipping startup migration (handled out-of-band)"
else
  echo ""
  echo "Running database migrations..."
  bun /app/migrate.mjs
  echo "Migrations complete."
fi

# Optionally seed the database
if [ "$SEED_DATABASE" = "true" ]; then
  echo ""
  echo "Seeding database..."
  bun /app/seed.mjs
  echo "Seeding complete."
fi

# Workspace bootstrap (idempotent). Runs whenever WORKSPACE_NAME is
# in the env — deploy automation can pre-seed the workspace step so
# the user doesn't have to walk the in-app onboarding wizard. No-op
# when the env var is absent.
if [ -n "$WORKSPACE_NAME" ]; then
  echo ""
  echo "Seeding workspace from env (WORKSPACE_NAME='$WORKSPACE_NAME')..."
  bun /app/seed-workspace.mjs
fi

# Start the application
echo ""
echo "Starting Quackback server on port ${PORT:-3000}..."
echo "========================================"
exec bun .output/server/index.mjs
