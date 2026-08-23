# Lovense Remote Reply Assistant

A personal, localhost-only review bot for the **Lovense Remote Windows app**. It watches the conversation that is currently open in Lovense Remote, detects new incoming text messages, prepares a reply, and lets you review or edit it before anything is sent.

This project does not use the Lovense developer API, pairing callbacks, Cloudflare, a tunnel, Discord, Twitch, or Chaturbate. It reads the local Electron chat interface through a Chrome DevTools endpoint bound to `127.0.0.1`.

## What it does

- Reads only the conversation currently open in Lovense Remote.
- Distinguishes incoming `.left .friend-msg` entries from outgoing `.right` entries.
- Ignores images, patterns, toy requests, notices, mobile-only `[vowgameinvitecard]` game invitations, and other non-text entries.
- Marks all visible history as already seen when monitoring starts or you switch conversations.
- Queues only genuinely new incoming text for review.
- Supports explicit opt-in automatic sending with a randomized reaction and reply-length typing delay.
- Lets you edit a proposed reply, place it in Lovense as an unsent draft, dismiss it, or explicitly send it.
- Rechecks the conversation title immediately before drafting and sending.
- Avoids repeating the same generated answer within a conversation and uses a natural callback when a provider returns duplicate text.

## Start on Windows

Requirements:

- Node.js 20 or newer.
- Lovense Remote for Windows installed at its normal per-user location.
- Lovense Remote logged in.
- Permission to approve the Windows Administrator prompt when Lovense Remote starts; elevated mode is required for its toy controls to appear.

From PowerShell:

```powershell
Set-Location 'G:\.gitClones\chatbot'
if (-not (Test-Path config.ini)) { Copy-Item config.example.ini config.ini }
.\scripts\start-personal.ps1

```

The launcher creates `config.ini` from the fully commented, grouped example when neither `config.ini` nor a legacy `.env` exists. When the localhost inspection endpoint is unavailable, it starts Lovense Remote as Administrator from its installation directory; approve the UAC prompt. Starting from the installation directory prevents `./resources/app/dist/` path errors. After Lovense opens, manually navigate to Messages and select the intended conversation. The launcher then starts the review dashboard. Open:

`http://127.0.0.1:3000`

Keep the PowerShell window open. Press `Ctrl+C` to stop the dashboard. Lovense Remote remains open.

`config.ini` is the primary personal configuration file. Existing `.env` files remain supported only as a fallback when `config.ini` does not exist. Regular operating-system environment variables override file values.

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

Lovense Remote does not need to be the active Windows window. It may remain behind other applications while the assistant types through its local DevTools connection. Keep the intended conversation selected inside Lovense; the assistant does not activate the window or switch contacts.

## Automatic sending and human-style delay

Automatic sending is off by default. Enable it from the localhost dashboard after opening the intended Lovense conversation. When armed, the assistant:

1. Detects a new incoming text message.
2. Generates a reply.
3. Waits a randomized reaction delay.
4. Adds simulated typing time based on reply length.
5. Rechecks that the same conversation is still selected.
6. Fills the Lovense editor and clicks Send.

Configure the timing in the private `config.ini`:

```ini
ENABLE_AUTO_SEND=false
AUTO_SEND_MIN_DELAY_SECONDS=8
AUTO_SEND_MAX_DELAY_SECONDS=25
AUTO_SEND_TYPING_MS_PER_CHAR=45
```

The defaults produce an 8–25 second random reaction plus approximately 45 milliseconds between each visibly typed character. Changing conversations, pausing the monitor, disabling automatic sending, or losing the expected Lovense controls prevents the scheduled response from being sent.
## Reply engines

The private `config.ini` controls reply generation.

### Built-in templates (default)

```ini
REPLY_PROVIDER=template
```

This works immediately and makes no AI network request. Replies are simple and intended mainly to validate detection and sending safely.

### Local Ollama

```ini
REPLY_PROVIDER=ollama
REPLY_MODEL=llama3.2
OLLAMA_URL=http://127.0.0.1:11434
```

Ollama and the selected model must already be installed and running. Message text is sent only to the local Ollama server.

### OpenAI-compatible service

```ini
REPLY_PROVIDER=openai
REPLY_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=YOUR_PRIVATE_KEY
```

Message text is sent to the configured provider. Keep the key only in `config.ini`; `config.ini` is ignored by Git.

Birth dates use American `MM/DD/YYYY` format in `config.ini` and are written as a full month, day, and year in replies—for example, `04/12/1990` becomes `April 12, 1990`.

The default persona is concise, natural, dominant, teasing, and flirty. It is restricted to consenting-adult conversation, respects stated boundaries, and avoids pressure, threats, shaming, or assumed consent. Customize the behavior with `REPLY_SYSTEM_PROMPT` and cap replies with `MAX_REPLY_CHARS`.

## Safety and privacy

- The dashboard and Lovense inspection endpoint bind only to `127.0.0.1`.
- Automatic sending is disabled by default. Enable it from the localhost dashboard or set ENABLE_AUTO_SEND=true in the private config.ini.
- Toy controls start disabled on every server launch, accept only one detected toy during initial setup, enforce Lovense's own range and step, and disable if the accepted toy changes.
- Random mode controls only the chat partner's toy shown in an accepted Live Control session. It starts off, uses the configured bounded intensity/speed and interval ranges, blocks manual slider changes while active, and returns every visible function to zero when Random mode is stopped, controls are disabled, the toy changes, or the session is lost.
- Conversation memory stays in process memory and resets when the server stops. OpenAI history sharing is separately disabled by default.
- Message text exists in process memory and the browser review page but is not written to disk by this project.
- The review queue resets when the Node process stops.
- Any local process running as your Windows user may be able to connect to a local debugging port. Stop the assistant when it is not needed, and restart Lovense Remote normally if you want the debugging endpoint removed.
- Lovense application updates may change DOM selectors. The assistant fails closed if it cannot find the expected conversation title, message list, editor, or Send control.

## Test

```powershell
npm test

```

Automated tests cover safe defaults, reply-provider validation, deduplication keys, existing command-policy tests, and template reply isolation. Tests do not send a real Lovense message. Live sending must be confirmed manually from the review dashboard.









