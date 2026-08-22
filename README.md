# Lovense Chatbot

A local, safety-first web chatbot for explicit Lovense device commands. It starts in **mock mode**, so no physical device is activated until live access is deliberately configured.

## Features

- Responsive chat interface with `/vibe`, `/pattern`, `/stop`, `/status`, and `/help`
- Mock, Lovense Server API, and direct LAN modes
- Strength and duration limits, optional access token, rate limiting, and no stored chat history
- Localhost-only server with no third-party runtime dependencies

## Start

Install Node.js 20 or newer, then run:

```powershell
Copy-Item .env.example .env
npm test
node --env-file=.env src/server.js

```

Open `http://127.0.0.1:3000`. Mock mode simulates successful commands without activating hardware.

## Commands

- `/vibe 10 5` — vibration strength 10 for 5 seconds
- `/pattern wave 10` — official wave preset for 10 seconds
- `/stop` — immediately stop active functions
- `/status` — show safe connection status
- `/help` — list commands and limits

Ordinary prose never activates a device.

## Live configuration

For server mode, set `LOVENSE_MODE=server`, `LOVENSE_DEVELOPER_TOKEN`, and `LOVENSE_USER_ID`. For LAN mode, set `LOVENSE_MODE=lan` and `LOVENSE_LAN_URL` to the HTTPS domain and port supplied by the pairing callback; do not append `/command`. `LOVENSE_TOY_ID` optionally targets one toy.

Pairing credentials must currently be obtained using the [official Lovense Standard API setup](https://developer.lovense.com/docs/standard-solutions/standard-api). QR pairing is not yet included.

Set `CHATBOT_ACCESS_TOKEN` to require a token in the interface. The app listens only on `127.0.0.1`; network or internet exposure requires HTTPS, stronger authentication, and a deployment review.

## Safety and current scope

- Keep mock mode enabled while developing.
- `/stop` is always available.
- Only control knowingly paired devices with the user's consent.
- Store secrets in `.env`, which Git ignores.


## Platform options

Every integration is opt-in. Set its `ENABLE_*` variable to `true` only after supplying its required credentials. Restart the server after environment changes. The Integrations tab reports only safe enabled/configured states and never returns secrets.

### Lovense QR pairing

Set `ENABLE_LOVENSE_PAIRING=true`, `LOVENSE_DEVELOPER_TOKEN`, `LOVENSE_PAIRING_USER_ID`, `LOVENSE_PAIRING_USER_NAME`, and a private `LOVENSE_PAIRING_USER_TOKEN`. Configure the Lovense developer dashboard callback as:

```text
https://YOUR-PUBLIC-HOST/webhooks/lovense
```

Generate the QR code from the Integrations tab. The code expires after four hours. For the returned LAN connection to control a device, deliberately set `LOVENSE_MODE=lan`; mock mode remains simulated even after pairing.

### Discord

Set `ENABLE_DISCORD=true`, `DISCORD_PUBLIC_KEY`, and `DISCORD_ALLOWED_USER_IDS`. Configure the Discord Interactions Endpoint URL as:

```text
https://YOUR-PUBLIC-HOST/webhooks/discord
```

Register these application commands in the Discord developer portal:

- `/consent enabled:<boolean>`
- `/lovense command:<string>` — for example `/vibe 10 5` or `/stop`

Requests are verified with Discord's Ed25519 signature. Replies are ephemeral. Users must be allowlisted and grant consent before device commands are accepted.

### Twitch

Set `ENABLE_TWITCH=true`, `TWITCH_EVENTSUB_SECRET`, and `TWITCH_ALLOWED_USER_IDS`. Create a `channel.chat.message` EventSub subscription with:

```text
https://YOUR-PUBLIC-HOST/webhooks/twitch
```

The callback validates the HMAC, rejects stale signatures, handles Twitch's verification challenge, and deduplicates message IDs. Allowlisted users use `!consent on`, `!consent off`, and supported slash commands in chat. This service accepts events but does not post chat replies; add a Twitch bot access token and the Send Chat Message API if public acknowledgements are desired.

### Chaturbate

Chaturbate's external statistics API is not a real-time tip webhook. This project therefore exposes a clearly labeled relay endpoint for a Chaturbate App/Bot or trusted bridge:

```text
POST https://YOUR-PUBLIC-HOST/webhooks/chaturbate
Authorization: Bearer YOUR_CHATURBATE_WEBHOOK_SECRET
```

Set `ENABLE_CHATURBATE=true`, a strong `CHATURBATE_WEBHOOK_SECRET`, `CHATURBATE_ALLOWED_USERS`, and tip mappings such as:

```text
CHATURBATE_TIP_RULES=25:5:5,50:10:8,100:15:10
```

Each mapping is `minimum tokens:vibration strength:seconds`; the highest matching threshold wins. Relay events require a unique `eventId` and either `{ "type": "tip", "username": "...", "tokens": 50 }` or `{ "type": "message", "username": "...", "message": "/stop" }`. Users grant or revoke consent with `/consent on` and `/consent off` through the relay.

## Consent, audit, and deployment

External-platform users need both an environment allowlist entry and active consent. Consent and the most recent audit events are held in memory and reset when the server restarts. Production deployment should replace in-memory state with persistent storage and distributed deduplication.

Webhook platforms require a public HTTPS URL; the default localhost listener cannot receive them directly. Use a trusted HTTPS reverse proxy or hosted deployment, keep the owner API protected with `CHATBOT_ACCESS_TOKEN`, and never expose `.env`.

## Verification boundaries

`npm test` verifies parsing, limits, mock isolation, signature logic, tip mapping, consent, deduplication, and pairing callback handling. It does not verify live Discord registration, Twitch EventSub delivery, a Chaturbate App/Bot relay, Lovense dashboard callbacks, public HTTPS routing, or physical device behavior.
