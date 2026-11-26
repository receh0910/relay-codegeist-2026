# Relay — Handover agent for Jira

**Codegeist 2026 · Apps for Software Teams · $120,000 · 33 paid places**

When someone goes on leave, gets sick, or leaves, their work hangs — nobody
knows what they were doing, what is blocked, or who can take over. Relay
finds that hanging work, suggests the best successor, and hands it over in
one click — from the Jira Radar, from the issue panel, or by asking the Rovo
agent in chat.

## Features (Fase 1 scaffold — core logic in `src/services/`)

1. **Orphan Radar** (Jira global page): open issues of people flagged away,
   ranked by a deterministic risk score (away + staleness + priority).
2. **Successor suggestions**: ranked by resolved related work in the same
   project/component + recent activity. Teamwork Graph enrichment (Fase 4).
3. **One-click handover**: reassign + a handover comment with context.
4. **Rovo agent "Relay"**: chat for handovers + 4 reusable actions (also
   exposed as MCP tools).
5. **Handover packet**: one away person's open work, risk, and successor each.

## Architecture

- UI Kit (`@forge/react`) — Radar global page + issue panel.
- Deterministic core, no LLM: `src/lib/orphans.js` (risk score),
  `src/services/orphans.js` (detect / rank / hand over),
  `src/services/jira.js` (Jira REST as the user),
  `src/services/away.js` (away flags in Forge KVS).
- Teamwork Graph: `src/services/twg.js` — best-effort, Jira fallback (Fase 4).
- No Forge LLM, no external service, no secrets. Runs inside Forge's free
  monthly allowances.

## Install (for judges)

**Installation link (Sharing with anyone, Jira only):**
https://developer.atlassian.com/console/install/f3661581-fce0-4552-a4bd-95300f9d290a?signature=AYABeONrVs%2F5wdUOyqp9BVXQF%2FUAAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4CxqLTo9l4lqXuFjNim1xJM%2Bp%2F3TVP9xHS2BrU5DRRucBM07ykJvXVFHaWO7JRd6x2gAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDHF5XI%2BWyCk1r0F9wAIBEIA7EU8In3%2BTUCSgFd%2BSaXkvufuJwETXQO3iPs3UxL4VSNzIHIz9yOsiM7dDrEFPnm0WhqZIJZzgrqvH34cAB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHi9bVMAkme4qVQX1fQHo6ePw3H40A7cGfz7yrmSfBWMXgF%2BnO3R8dWWRsTXGU%2BSP4WPAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQM7TkZJ2r7R1p%2FEwDoAgEQgDsqqS0uJ7vG%2Fd5%2BZt1NiHUYN9nJsjEF6yjqtkrhnn6II589AhWND9FBIQhM%2FSh%2BSDHlxzMsaewwhhe2XwAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeDYASx0XCjkny4iLV6vz%2BKtEGSGT6kdt0QRpkn6D%2FlVEAQr9%2Fxj13bH%2Bs%2BdJG9%2BLdXMAAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAxC1dyRhFa%2FahtLD14CARCAOzc4hH5Q805j5DH0vIbfzTgyLvXmLMm%2FAXIymIkEZYDNlCTKZTr%2FZHOcJnUghS4NWGSGWRsNPqE9GwD9AgAAAAAMAAAQAAAAAAAAAAAAAAAAAFi7SgtFjVAuHrIh%2FrC7x1X%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADKdSvePwD1is6FQUc1eX0kDzsSYHybVaat%2BGTuR5m2US54cOMtvHr1DVeFlJjdpI8gcwRJ3Rc%2BgyPrv9L47oNwQPBY%3D&product=jira

1. Open the installation link from the Devpost submission and install on
   your Jira site (Sharing link — no CLI needed).
2. Open **Apps → Relay — Handover Radar**.
3. Flag someone away (Radar → set away flag, with return date), then watch
   their open issues appear ranked by risk.
4. Click **Hand over to best successor** on any issue, or ask Rovo:
   *"Who should take over Ana's work while she is on leave?"*

**Production status (Fase 5, 26 Nov 2026):** deployed to production
(Forge major version 2, lint 0 issues, Runs on Atlassian eligible) and
verified live on a production installation — trigger fires on issue
update. The Sharing installation link is issued in the Developer Console
(Distribution → Sharing) and pasted into the Devpost submission; it is
not a CLI install.

## Development

```bash
npm install -g @forge/cli
forge login                     # Atlassian API token
forge register                  # writes the app id into manifest.yml
npm install
forge deploy -e development
forge install -e development --product jira --site harimauameh12.atlassian.net
```

Seed demo data first: see `seed/README.md`.

## Cost

$0 — Forge free allowances only, Rovo credits are not billed to the
developer, no Forge LLM used.
