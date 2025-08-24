# Obsyncth - AI Coding Agent Instructions

## Project Overview
Obsyncth is a cross-platform Obsidian plugin that integrates Syncthing file synchronization. It features conditional Node.js imports for mobile compatibility and a sophisticated tabbed settings interface.

## Core Architecture

### Mobile-First Conditional Loading Pattern
The plugin uses a critical **conditional import system** to work on both desktop and mobile:

```typescript
// Platform detection MUST work without Node.js APIs
function detectMobilePlatform(): boolean {
  return (window as any).app?.isMobile || /Mobile|Android|iPhone/i.test(navigator.userAgent);
}

// Conditional imports - NEVER import Node.js modules at top level
let spawn: any, exec: any, fs: any, path: any, http: any;
try {
  if (!detectMobilePlatform()) {
    // Desktop-only imports
    fs = require('fs');
    spawn = require('child_process').spawn;
  }
} catch (error) {
  // Mobile fallbacks - provide no-op functions
  spawn = () => ({ pid: -1, on: () => {}, kill: () => {} });
}
```

**CRITICAL**: All Node.js operations must be wrapped in platform checks and provide mobile fallbacks.

### Dual Tab Architecture
The settings interface switches between mobile/desktop implementations:

```typescript
private renderAdvancedTab(container: HTMLElement): void {
  if (this.plugin.detectMobilePlatform() || this.plugin.settings.mobileMode) {
    this.renderMobileAdvancedTab(container);  // Remote connection features
  } else {
    this.renderDesktopAdvancedTab(container); // Binary management, process control
  }
}
```

### SyncthingMonitor Event System
Real-time status monitoring using Node.js HTTP (desktop) or fetch (mobile):

```typescript
class SyncthingMonitor extends EventEmitter {
  // Uses Node.js http.request for localhost communication
  // Emits 'status-update' events with { status, fileCompletion, connectedDevicesCount }
}

// Usage in plugin
this.monitor.on('status-update', (data) => {
  this.updateStatusBarFromMonitor(data);
});
```

## Key Development Patterns

### Build & Development Commands
```bash
npm run dev        # Watch mode with source maps
npm run build      # Production build (TypeScript errors are warnings)
npm run version    # Bump version across manifest.json and versions.json
```

### Binary Management System
Syncthing executables are stored in `"Syncthing binary-config/"` with platform-specific naming:
- Windows: `syncthing.exe`
- macOS: `syncthing-macos` 
- Linux: `syncthing-linux`

Binary download/extraction uses platform-specific archive handling (ZIP/TAR.GZ) with executable validation.

### Settings Persistence
Settings auto-save triggers monitor restart:
```typescript
async saveSettings() {
  await this.saveData(this.settings);
  this.monitor.stopMonitoring();
  setTimeout(() => this.startStatusMonitoring(), 1000);
}
```

### Connection Modes
Three operational modes with different URL resolution:
1. **Desktop**: `http://127.0.0.1:8384` (local binary)
2. **Mobile/Remote**: Uses `settings.remoteUrl`
3. **Docker**: `http://127.0.0.1:8380/` (containerized with CORS proxy)

## File Organization

- `main.ts`: Single-file architecture (~2800 lines)
- `manifest.json`: Plugin metadata (sync with package.json version)
- `esbuild.config.mjs`: Build configuration with Obsidian externals
- `scripts/release.sh`: Automated release with git tagging
- `docker/`: Docker Compose stack for containerized Syncthing

## Common Issues & Solutions

### TypeScript Errors
The build shows TypeScript warnings about implicit 'any' types - these are **non-blocking** and expected due to conditional Node.js imports. Focus on runtime functionality over strict typing.

### Mobile Compatibility
- All Node.js operations must check `platformInfo.isDesktop`
- Provide meaningful fallbacks for mobile users
- Use `SimpleEventEmitter` class when Node.js EventEmitter unavailable

### Status Monitoring
The monitoring system uses different approaches:
- Desktop: Node.js HTTP polling of localhost
- Mobile: Fetch API to remote Syncthing instance

Always test both modes when modifying status-related code.

## Debugging
Use the Advanced tab's "View Logs" button which outputs diagnostic info to browser console with settings, platform info, and executable paths.

## Release Process
The `scripts/release.sh` handles version synchronization, building, git tagging, and GitHub release creation automatically. Always use this instead of manual version bumps.
