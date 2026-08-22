# Lovense Remote Reply Assistant

A personal, localhost-only review bot for the **Lovense Remote Windows app**. It watches the conversation that is currently open in Lovense Remote, detects new incoming text messages, prepares a reply, and lets you review or edit it before anything is sent.

This project does not use the Lovense developer API, pairing callbacks, Cloudflare, a tunnel, Discord, Twitch, or Chaturbate. It reads the local Electron chat interface through a Chrome DevTools endpoint bound to `127.0.0.1`.

## What it does

- Reads only the conversation currently open in Lovense Remote.
- Distinguishes incoming `.left .friend-msg` entries from outgoing `.right` entries.
- Ignores images, patterns, toy requests, notices, and other non-text entries.
- Marks all visible history as already seen when monitoring starts or you switch conversations.
- Queues only genuinely new incoming text for review.
- Never sends automatically in the current release.
- Lets you edit a proposed reply, place it in Lovense as an unsent draft, dismiss it, or explicitly send it.
- Rechecks the conversation title immediately before drafting and sending.

## Start on Windows

Requirements:

- Node.js 20 or newer.
- Lovense Remote for Windows installed at its normal per-user location.
- Lovense Remote logged in.

From PowerShell:

```powershell
Set-Location 'G:\.gitClones\chatbot'
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
.\scripts\start-personal.ps1

```

The launcher restarts Lovense Remote only when its localhost inspection endpoint is unavailable, then starts the review dashboard. Open:

`http://127.0.0.1:3000`

Keep the PowerShell window open. Press `Ctrl+C` to stop the dashboard. Lovense Remote remains open.

## Daily workflow

1. Open the Lovense conversation you want monitored.
2. Start the personal launcher.
3. Existing visible messages are used as a baseline and are not answered.
4. Leave that conversation selected while monitoring it.
5. When a new incoming text arrives, review the proposed reply in the localhost dashboard.
6. Choose one action:
   - **Place draft** — fills the Lovense editor but does not send.
   - **Send now** — asks for confirmation, fills the editor, and clicks Lovense Send.
   - **Dismiss** — marks the suggestion as ignored.

The initial version intentionally does not jump among contacts. That prevents a reply intended for one person from being entered into another conversation.

## Reply engines

The private `.env` controls reply generation.

### Built-in templates (default)

```dotenv
REPLY_PROVIDER=template
```

This works immediately and makes no AI network request. Replies are simple and intended mainly to validate detection and sending safely.

### Local Ollama

```dotenv
REPLY_PROVIDER=ollama
REPLY_MODEL=llama3.2
OLLAMA_URL=http://127.0.0.1:11434
```

Ollama and the selected model must already be installed and running. Message text is sent only to the local Ollama server.

### OpenAI-compatible service

```dotenv
REPLY_PROVIDER=openai
REPLY_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=YOUR_PRIVATE_KEY
```

Message text is sent to the configured provider. Keep the key only in `.env`; `.env` is ignored by Git.

Customize the response behavior with `REPLY_SYSTEM_PROMPT` and cap replies with `MAX_REPLY_CHARS`.

## Safety and privacy

- The dashboard and Lovense inspection endpoint bind only to `127.0.0.1`.
- The current release requires review; there is no automatic-send environment option.
- Message text exists in process memory and the browser review page but is not written to disk by this project.
- The review queue resets when the Node process stops.
- Any local process running as your Windows user may be able to connect to a local debugging port. Stop the assistant when it is not needed, and restart Lovense Remote normally if you want the debugging endpoint removed.
- Lovense application updates may change DOM selectors. The assistant fails closed if it cannot find the expected conversation title, message list, editor, or Send control.

## Test

```powershell
npm test

```

Automated tests cover safe defaults, reply-provider validation, deduplication keys, existing command-policy tests, and template reply isolation. Tests do not send a real Lovense message. Live sending must be confirmed manually from the review dashboard.