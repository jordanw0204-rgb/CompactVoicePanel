# CompactVoicePanel

A custom Vencord userplugin that replaces Discord's large bottom-left voice connection panel with a compact voice tile beside the account controls.

It is designed for people who want the voice area to take less room while still keeping useful call information visible.

## What It Does

- Hides Discord's large voice connection panel in the bottom-left sidebar.
- Adds a compact voice tile next to the account panel.
- Shows the current voice channel or call name.
- Shows a small strip of connected user avatars.
- Opens a hover popout with connected voice users.
- Lets you click the tile to jump back to the connected voice channel.
- Shows a disconnect button when hovering the tile.

## Dependencies

This plugin is standalone. It does not require any private companion plugins.

It only installs the compact voice UI. Fake mute/deafen controls are not included in this public plugin.


## Installing Vencord From Source

Custom Vencord plugins require a source build of Vencord. The normal one-click installer is not enough for custom userplugins.

1. Install the prerequisites:
   - [Git](https://git-scm.com/downloads)
   - [Node.js](https://nodejs.org/)
   - [pnpm](https://pnpm.io/installation)

2. Verify they are available in your terminal:

```sh
git --version
node --version
pnpm --version
```

3. Clone Vencord:

```sh
git clone https://github.com/Vendicated/Vencord
cd Vencord
```

4. Install Vencord dependencies:

```sh
pnpm install --frozen-lockfile
```

## Installing This Plugin

From inside your Vencord folder:

```sh
mkdir -p src/userplugins
cd src/userplugins
git clone https://github.com/jordanw0204-rgb/CompactVoicePanel
```

Then build and inject Vencord:

```sh
cd ../..
pnpm build
pnpm inject
```

After injection finishes, fully restart Discord.

## Enabling The Plugin

1. Open Discord.
2. Go to `User Settings`.
3. Open the `Vencord` plugin settings.
4. Enable `CompactVoicePanel`.
5. Join a voice channel or call to see the compact tile.

## Updating

From the plugin folder:

```sh
cd src/userplugins/CompactVoicePanel
git pull
```

Then rebuild and reinject Vencord:

```sh
cd ../../..
pnpm build
pnpm inject
```

Restart Discord afterward.

## Troubleshooting

- If the plugin does not appear, confirm the folder is exactly `src/userplugins/CompactVoicePanel`.
- If Vencord fails to build, confirm your Vencord source dependencies are installed with `pnpm install --frozen-lockfile`.
- If Discord still shows the large voice panel, restart Discord after injecting.
- If the bottom-left controls look cramped, another account-panel plugin or custom theme may be taking extra space.

## Notes

This is a custom userplugin, not an official Vencord plugin. Use it at your own risk and read the source before installing custom plugins from anyone.

Official Vencord docs:

- [Installing Vencord from source](https://docs.vencord.dev/installing/)
- [Installing custom plugins](https://docs.vencord.dev/installing/custom-plugins/)
