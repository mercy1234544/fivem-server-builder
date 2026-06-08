# FiveM Server Builder

A professional desktop application for creating, managing, organizing, maintaining, updating, and troubleshooting FiveM servers.

## Features

- **Server Creation Wizard** - Step-by-step server setup with framework selection, artifact downloads, and automatic configuration
- **Resource Manager** - Scan, enable/disable, and manage all server resources
- **Resource Organizer** - Automatically categorize resources with vendor protection
- **Startup Order Manager** - Visual drag-and-drop startup order management
- **Health Scanner** - Detect missing dependencies, broken manifests, and configuration issues
- **Backup System** - Full, resource, and config backups with restore capability
- **File Explorer** - Built-in file browser for server files
- **Server.cfg Editor** - Dedicated editor with validation and auto-backup
- **Marketplace** - One-click installation of popular resources
- **Multi-Server Support** - Manage multiple development/production/testing servers

## Tech Stack

- Electron
- React 18
- TypeScript
- Tailwind CSS
- Framer Motion
- React Query
- Zustand

## Getting Started

```bash
# Install dependencies
npm install

# Run in development mode
npm run electron:dev

# Build for production
npm run build
```

## Project Structure

```
src/
├── main/              # Electron main process
│   ├── main.ts        # App entry point
│   ├── preload.ts     # Context bridge
│   └── services/      # Backend services
├── renderer/          # React frontend
│   ├── components/    # Shared components
│   ├── pages/         # Page components
│   ├── stores/        # Zustand stores
│   ├── styles/        # CSS
│   └── types/         # TypeScript declarations
```

## Safety

- Never automatically deletes resources
- Always asks for confirmation on destructive actions
- Creates backups before major changes
- Vendor resources (JG, TStudio) are never auto-moved
- All actions are logged
