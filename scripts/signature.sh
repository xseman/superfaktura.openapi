#!/bin/bash

# Authenticated request example for the SuperFaktura API
# (https://github.com/superfaktura/docs/blob/master/intro.md#authentication).
#
# Credentials are read from .env in the repository root (see .env.example),
# or from already exported SF_EMAIL / SF_API_KEY / SF_MODULE / SF_COMPANY_ID / SF_API_URL.
#
# Usage: ./scripts/signature.sh [path] [query]
#   ./scripts/signature.sh                                  # GET /users/company_switcher
#   ./scripts/signature.sh /invoices/index.json/listinfo:1  # GET with named parameters
#   ./scripts/signature.sh /countries/index/view_full:1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SF_ENV_FILE:-$SCRIPT_DIR/../.env}"

if [ -f "$ENV_FILE" ]; then
	set -a
	# shellcheck disable=SC1090
	. "$ENV_FILE"
	set +a
fi

: "${SF_EMAIL:?SF_EMAIL is not set (create .env from .env.example)}"
: "${SF_API_KEY:?SF_API_KEY is not set (create .env from .env.example)}"
: "${SF_MODULE:?SF_MODULE is not set (create .env from .env.example)}"
SF_COMPANY_ID="${SF_COMPANY_ID:-}"
SF_API_URL="${SF_API_URL:-https://moja.superfaktura.sk}"

path="${1:-/users/company_switcher}"
query="${2:-}"

# All header values must be URL encoded (e.g. "hello+world@example.com" -> "hello%2Bworld%40example.com").
urlencode() {
	local LC_ALL=C s="$1" out="" c
	for ((i = 0; i < ${#s}; i++)); do
		c="${s:i:1}"
		case "$c" in
			[a-zA-Z0-9.~_-]) out+="$c" ;;
			*) out+="$(printf '%%%02X' "'$c")" ;;
		esac
	done
	printf '%s' "$out"
}

# Authorization: SFAPI email=...&apikey=...&module=...[&company_id=...]
authorization="SFAPI email=$(urlencode "$SF_EMAIL")&apikey=$(urlencode "$SF_API_KEY")&module=$(urlencode "$SF_MODULE")"
if [ -n "$SF_COMPANY_ID" ]; then
	authorization="${authorization}&company_id=$(urlencode "$SF_COMPANY_ID")"
fi

curl -sS "${SF_API_URL}${path}${query}" \
	-H "Authorization: ${authorization}" \
	-H "Accept: application/json" \
	-H "Content-Type: application/json"
echo
