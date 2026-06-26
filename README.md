# Vencord Compact Voice Panel

Compact Voice Panel replaces Discord's bulky bottom-left voice connection block with a smaller tile next to your account controls.

The goal is simple: keep the call controls usable without letting the voice panel eat the whole bottom bar.

## Features

- Replaces the large voice connection block with a compact tile.
- Shows the current voice channel or call name.
- Shows a small connected-user avatar strip.
- Opens a member popout on hover.
- Lets you right-click voice user avatars to adjust their local volume.
- Marks users who are currently streaming with a small live badge.
- Jumps back to the voice channel when clicked.
- Shows a disconnect button while hovering the tile.
- Keeps Discord's normal mute, deafen, and settings buttons in the account-control row.

## Requirements

- A source build of Vencord.
- Discord desktop.

This plugin is standalone. It does not require any private companion plugin.

## Install Vencord From Source

Custom Vencord plugins only work with a source build.

Install:

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/)
- [pnpm](https://pnpm.io/installation)

Then clone and install Vencord:

```sh
git clone https://github.com/Vendicated/Vencord
cd Vencord
pnpm install --frozen-lockfile
```

## Install This Plugin

From the Vencord folder:

```sh
mkdir -p src/userplugins
cd src/userplugins
git clone https://github.com/jordanw0204-rgb/vencord-compact-voice-panel CompactVoicePanel
```

Build and inject Vencord:

```sh
cd ../..
pnpm build
pnpm inject
```

Restart Discord after injection.

## Enable

1. Open Discord settings.
2. Go to `Vencord` -> `Plugins`.
3. Enable `CompactVoicePanel`.
4. Join a voice channel or call.

## Update

```sh
cd src/userplugins/CompactVoicePanel
git pull
cd ../../..
pnpm build
pnpm inject
```

Restart Discord after updating.

## Troubleshooting

- Plugin missing: make sure the folder is `src/userplugins/CompactVoicePanel`.
- Build failed: run `pnpm install --frozen-lockfile` in the Vencord folder.
- Old voice panel still visible: rebuild, inject, and fully restart Discord.
- Account controls look cramped: another account-panel plugin or theme may be taking extra space.

## Links

- [Vencord source install docs](https://docs.vencord.dev/installing/)
- [Vencord custom plugin docs](https://docs.vencord.dev/installing/custom-plugins/)
