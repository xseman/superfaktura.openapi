#!/bin/bash

# Validates openapi.yaml with xseman/openapi-generator (`validate` subcommand).
#
# The generator binary is taken from $OPENAPI_GENERATOR, or `openapi-generator`
# on PATH. Install it from https://github.com/xseman/openapi-generator
# (`go install github.com/xseman/openapi-generator/cmd/openapi-generator@latest`
# or a release binary).
#
# Note: list endpoints (/invoices/index.json, ...) take their filters as CakePHP
# named parameters (`/name:value`) appended to the path. They are documented as
# query parameters because `[/{ATTRIBUTE}:{VALUE}]*` is not a valid path template.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GENERATOR="${OPENAPI_GENERATOR:-openapi-generator}"
SPEC="${SCRIPT_DIR}/../openapi.yaml"

if ! command -v "${GENERATOR}" >/dev/null 2>&1; then
	echo "openapi-generator not found (set OPENAPI_GENERATOR or install xseman/openapi-generator)" >&2
	exit 1
fi
if ! "${GENERATOR}" validate --help >/dev/null 2>&1; then
	echo "${GENERATOR} does not support 'validate'; install a current xseman/openapi-generator" >&2
	exit 1
fi

echo "==> openapi-generator validate: $(basename "$SPEC")"
"${GENERATOR}" validate -i "$SPEC" --recommend
