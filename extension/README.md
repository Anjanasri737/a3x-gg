# Gharpayy CRM for WhatsApp Web

Puts the Gharpayy CRM panel inside your real WhatsApp Web tab — not a simulated page.

## Install (each operator, one minute)

1. Open `chrome://extensions` in Chrome or Edge.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this `extension` folder.
4. Open the extension's **Options** and paste your Gharpayy CRM address.
5. Open <https://web.whatsapp.com> — the CRM docks on the right.

The toolbar button hides and shows the panel. Drag its left edge to resize.

## What it does

- Loads the CRM companion (`/companion`) beside the chat list.
- Watches the open conversation and sends its name/number to the CRM panel, so the
  right lead is loaded as soon as you click a chat.
- Nothing about your chats is uploaded by the extension itself; it only reads the
  visible conversation title to match the lead.
