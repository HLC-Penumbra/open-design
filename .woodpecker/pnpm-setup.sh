#!/bin/sh
set -e

# Each Woodpecker step runs in a fresh container, so corepack state does not
# persist between steps. This script enables corepack and activates the pnpm
# version pinned by pnpm-lock.yaml.
corepack enable
corepack prepare pnpm@10.33.2 --activate
