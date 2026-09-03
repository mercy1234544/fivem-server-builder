# Mercy Launcher

**A modern game-management hub for FiveM, Minecraft, Assetto Corsa, BeamNG.drive, servers, mods, resources, and more.**

[Join the Discord](https://discord.gg/FkwnmdZx6m) for help and support.

Mercy Launcher is a desktop application that brings game management into one place. FiveM is the first fully functional hub — everything the original FiveM Server Builder project did (server creation, resource management, backups, diagnostics, Vehicle Studio, and more) is still here, now living inside the Mercy Launcher shell rather than as a standalone app. Minecraft, Assetto Corsa, and BeamNG.drive are part of the platform today as dedicated hubs, with their management features being built out over time.

## What's inside today

**Mercy Launcher shell**
- A modern, dark, purple-accented desktop interface — Home, Library, Downloads, and Settings
- Home dashboard with a game card per platform, Latest News, and Quick Actions
- Discord authentication gates access to the app; your session and username are shown throughout
- Automatic updates — the app checks for and installs new releases on its own

**FiveM Hub** (fully functional)
- Browse Servers / My Servers as the two primary entry points
- Create and manage FiveM servers — start, stop, restart, console, configuration
- Resource management: scan, enable/disable, organize, and update resources
- Vehicle Studio — a full vehicle handling/metadata editor with Smart Tune, presets, diagnostics, and spawn-name validation
- Health Scanner, backups, file explorer, server.cfg editor, and a resource Store
- Multi-server support for development, staging, and production servers

**Minecraft, Assetto Corsa, BeamNG.drive**
- Present today as their own hubs on Home, with a clear "coming soon" state inside
- Being expanded over time into full management hubs alongside FiveM

## Tech stack

- Electron 28, React 18, TypeScript, Vite
- Tailwind CSS, Framer Motion, Zustand
- electron-updater (auto-updates), electron-builder (Windows NSIS installer)

## Getting started

```bash
# Install dependencies
npm install

# Run in development mode
npm run electron:dev

# Build for production
npm run build

# Build the Windows installer
npm run build:exe
```

## Project structure

```
src/
├── main/              # Electron main process
│   ├── main.ts        # App entry point
│   ├── preload.ts     # Context bridge
│   ├── shared/         # Pure logic shared with the renderer (e.g. Vehicle Studio's handling engine)
│   └── services/      # Backend services (server management, resources, Vehicle Studio, auth, etc.)
├── renderer/          # React frontend
│   ├── components/    # Shared components (sidebar, game cards, tuning UI, ...)
│   ├── pages/         # Page components (Home, FiveM Hub, Library, Downloads, Settings, ...)
│   ├── stores/        # Zustand stores
│   └── types/         # TypeScript declarations
services/
└── vehicle-studio-auth/  # Standalone Discord OAuth + session backend
```

## Safety

- Never automatically deletes resources
- Always asks for confirmation on destructive actions
- Creates backups before major changes
- Vendor resources (JG, TStudio) are never auto-moved
- All actions are logged
