#!/bin/bash

# Generates a TypeScript (fetch) client from openapi.yaml into client/ (gitignored)
# with xseman/openapi-generator.
#
# Usage: ./scripts/generate.sh [generator] [output dir]
#   ./scripts/generate.sh                      # typescript-fetch -> client/
#   ./scripts/generate.sh dart-fetch client-dart
#   TYPECHECK=1 ./scripts/generate.sh          # also run tsc on the generated client
#
# The typecheck is opt-in: it currently fails on known xseman/openapi-generator
# issues (map-of-array response type in apis.mustache, `Country`/`country`
# property name collision, tsconfig `downlevelIteration` removed in TypeScript 6).
#
# The generator binary is taken from $OPENAPI_GENERATOR, or `openapi-generator`
# on PATH (https://github.com/xseman/openapi-generator). Run `openapi-generator list`
# for available generators and `openapi-generator config-help <generator>` for options.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
GENERATOR="${OPENAPI_GENERATOR:-openapi-generator}"
SPEC="${ROOT_DIR}/openapi.yaml"
TEMPLATE="${1:-typescript-fetch}"
OUTPUT="${2:-${ROOT_DIR}/client}"

if ! command -v "${GENERATOR}" >/dev/null 2>&1; then
	echo "openapi-generator not found (set OPENAPI_GENERATOR or install xseman/openapi-generator)" >&2
	exit 1
fi

echo "==> openapi-generator validate: $(basename "$SPEC")"
"${GENERATOR}" validate -i "$SPEC"

echo "==> openapi-generator generate: ${TEMPLATE} -> ${OUTPUT}"
rm -rf "${OUTPUT}"
"${GENERATOR}" generate \
	-i "$SPEC" \
	-g "${TEMPLATE}" \
	-o "${OUTPUT}" \
	-p withPackageJson=true \
	-p withInterfaces=true

if [ "${TYPECHECK:-0}" = "1" ] && [ "${TEMPLATE}" = "typescript-fetch" ]; then
	echo "==> typecheck generated client"
	(cd "${OUTPUT}" && npx -y -p typescript@5 tsc --noEmit -p tsconfig.json)
fi
