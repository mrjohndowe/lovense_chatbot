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

Discord, Twitch, or another chat-platform adapter can be added after selecting the intended platform and user model.
