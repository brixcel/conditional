#!/usr/bin/env sh
# Prints the current Philippine time (UTC+8) as "YYYY-MM-DD HH:MM", taken from an
# internet server's Date header so a drifting PC clock does not skew handoff timestamps.
# Falls back to the local clock (marked "(PC clock)") when offline.
# Usage: sh scripts/now-pht.sh          -> 2026-11-25 22:18
#        sh scripts/now-pht.sh --time   -> 22:18
hdr=$(curl -sI --max-time 5 https://www.google.com 2>/dev/null | tr -d '\r' | grep -i '^date:' | cut -d' ' -f2-)
if [ -n "$hdr" ]; then
    out=$(TZ=UTC-8 date -d "$hdr" '+%Y-%m-%d %H:%M' 2>/dev/null)
fi
[ -z "$out" ] && out="$(TZ=UTC-8 date '+%Y-%m-%d %H:%M') (PC clock)"
if [ "$1" = "--time" ]; then echo "$out" | cut -d' ' -f2; else echo "$out"; fi
