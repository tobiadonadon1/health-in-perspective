#!/bin/sh
# Switches Garmin on: asks for the Garmin consumer key and secret (typing stays hidden), makes a random webhook token,
# stores all three as Supabase secrets, and prints the two URLs to paste into the Garmin developer portal.
# Run it in your own Terminal:  sh scripts/set-garmin-secrets.sh
set -e
REF=pisvrssqmlspuahyvbrx
printf 'Garmin consumer key: '; stty -echo; read KEY; stty echo; echo
printf 'Garmin consumer secret: '; stty -echo; read SECRET; stty echo; echo
[ -n "$KEY" ] && [ -n "$SECRET" ] || { echo 'Both values are needed.'; exit 1; }
TOKEN=$(openssl rand -hex 32)
F=$(mktemp); chmod 600 "$F"
printf 'GARMIN_CLIENT_ID=%s\nGARMIN_CLIENT_SECRET=%s\nGARMIN_WEBHOOK_TOKEN=%s\n' "$KEY" "$SECRET" "$TOKEN" > "$F"
supabase secrets set --project-ref "$REF" --env-file "$F" >/dev/null; rm -f "$F"
echo 'Saved in Supabase. Now, in the Garmin developer portal:'
echo
echo '1. OAuth redirect URL:'
echo '   https://app.xeyo.ai/garmin-callback.html'
echo
echo '2. Endpoint Configuration: set every summary type to PUSH with this URL:'
echo "   https://$REF.supabase.co/functions/v1/health-api?hook=garmin&token=$TOKEN"
echo '   (Dailies, Sleeps, HRV Summary, Body Compositions, Pulse Ox, Respiration, Activities,'
echo '    Manually Updated Activities, Deregistrations, User Permissions Change)'
