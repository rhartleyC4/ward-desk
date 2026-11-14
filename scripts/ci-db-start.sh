#!/usr/bin/env bash
# Starts local Supabase in CI. Locally, use `npm run db:start`.
#
# * Pulls images from ghcr.io (set by SUPABASE_INTERNAL_IMAGE_REGISTRY in ci.yml), not the
#   default public.ecr.aws, whose anonymous pulls are rate limited per IP and shared by every
#   GitHub runner ("error from registry: Rate exceeded").
# * Skips the services no test uses: Studio, storage, image transforms, the analytics pair
#   (logflare, vector), postgres-meta and the pooler. That is about 4.6 GB less to pull.
# * Starts once more from scratch if the first try fails, since a failed pull can leave a
#   half-started container holding a port ("address already in use").
set -euo pipefail

skip=studio,storage-api,imgproxy,logflare,vector,postgres-meta,supavisor

npm run functions:build

if ! npx supabase start -x "$skip"; then
  echo "::warning::Supabase didn't start; stopping it and trying once more"
  npx supabase stop --no-backup || true
  npx supabase start -x "$skip"
fi
