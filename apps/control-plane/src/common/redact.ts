/**
 * Remove secrets from URLs before they are written to wallet descriptions,
 * metadata or logs. Telegram bot tokens are embedded in the path
 * (`/bot<id>:<token>/method`), so they must never reach the ledger.
 */
export function redactUrl(input: string): string {
  return input
    .replace(/\/bot[0-9]+:[A-Za-z0-9_-]+/gi, '/bot<redacted>')
    .replace(
      /([?&](?:token|key|api_key|secret|access_token)=)[^&\s]+/gi,
      '$1<redacted>',
    );
}
