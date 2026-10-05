#!/usr/bin/env bash
# One-shot: paste your bot token once (hidden), it is verified with Telegram,
# stored as a GitHub secret via stdin (never in argv/history), then a run is triggered.
set -euo pipefail

read -r -s -p "Paste bot token (hidden): " TOKEN; echo
TOKEN="$(printf '%s' "$TOKEN" | tr -d '[:space:]"'"'"'')"
TOKEN="${TOKEN#bot}"

if ! [[ "$TOKEN" =~ ^[0-9]{6,12}:[A-Za-z0-9_-]{30,}$ ]]; then
  echo "✗ That doesn't look like a bot token (length ${#TOKEN}, expected ~46, like 123456789:AA...)." >&2
  exit 1
fi

if ! curl -fsS "https://api.telegram.org/bot${TOKEN}/getMe" >/dev/null; then
  echo "✗ Telegram rejected this token (revoked or wrong). Get a fresh one from @BotFather." >&2
  exit 1
fi
echo "✓ Token is valid"

printf '%s' "$TOKEN" | gh secret set TELEGRAM_BOT_TOKEN
echo "✓ Secret stored. Triggering a run..."
gh workflow run daily-digest
sleep 5
gh run watch "$(gh run list --workflow=daily.yml --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status
