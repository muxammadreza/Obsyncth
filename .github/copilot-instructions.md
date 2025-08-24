# Obsyncth - AI Coding Agent Instructions

## Project Overview
Obsyncth is a cross-platform Obsidian plugin that integrates Syncthing file synchronization. It features conditional Node.js imports for mobile compatibility, a sophisticated tabbed settings interface, and robust binary/configuration management with dynamic version handling.

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

### Robust Plugin Path Detection System
The plugin uses dynamic folder detection to handle both regular installs and BRAT beta versions:

```typescript
getPluginAbsolutePath(): string {
    const basePath = this.app.vault.adapter.getBasePath();
    
    // Dynamic detection for BRAT beta versions (e.g., obsyncth-1.5.6-beta.7)
    if (!detectMobilePlatform() && typeof require !== 'undefined') {
        try {
            const fs = require('fs');
            const path = require('path');
            const pluginsDir = path.join(basePath, this.app.vault.configDir, 'plugins');
            
            if (fs.existsSync(pluginsDir)) {
                const folders = fs.readdirSync(pluginsDir);
                
                // Find folder containing our main.js (this running instance)
                for (const folder of folders) {
                    if (folder.startsWith(this.manifest.id + '-') || folder === this.manifest.id) {
                        const mainJsPath = path.join(pluginsDir, folder, 'main.js');
                        if (fs.existsSync(mainJsPath)) {
                            return `${basePath}/${this.app.vault.configDir}/plugins/${folder}/`;
                        }
                    }
                }
            }
        } catch (e) {
            console.log('Could not dynamically detect plugin folder:', e);
        }
    }
    
    // Fallback: Traditional method
    const relativePath = `${this.app.vault.configDir}/plugins/${this.manifest.id}-${this.manifest.version}/`;
    return `${basePath}/${relativePath}`;
}
```

**CRITICAL**: This system handles version mismatches between manifest.json and actual installed folder names (common with BRAT beta installations).

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

### Dynamic Version Management
Plugin version is read dynamically from manifest to handle BRAT beta versions:

```typescript
// System diagnostics shows current version dynamically
pluginItem.createSpan({ 
  cls: 'syncthing-diagnostic-value', 
  text: this.plugin.manifest.version  // Dynamic, not hardcoded
});
```

### Organized File Structure
All Syncthing-related files are contained within a single organized folder:

```
Syncthing binary-config/
├── syncthing-config/          # Configuration files (--home directory)
│   ├── cert.pem
│   ├── config.xml
│   ├── https-cert.pem
│   ├── key.pem
│   ├── index-v2/
│   └── syncthing.lock
├── syncthing-linux            # Platform-specific executables
├── syncthing-macos
└── syncthing.exe
```

**CRITICAL**: Config directory path is `${pluginPath}Syncthing binary-config/syncthing-config`

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

Binary download/extraction uses platform-specific archive handling (ZIP/TAR.GZ) with executable validation. The `extractAndInstallSyncthing()` function MUST use the same folder path as `getSyncthingExecutablePath()` to ensure downloaded binaries are found correctly.

### Configuration Management
Syncthing configuration is stored in `"Syncthing binary-config/syncthing-config/"` using the `--home` parameter:

```typescript
const configDir = `${this.getPluginAbsolutePath()}Syncthing binary-config/syncthing-config`;
const args = ['--home', configDir, '--no-browser', '--gui-address', `127.0.0.1:${port}`];
```

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

### Binary Folder Path Consistency
**Critical**: The `extractAndInstallSyncthing()` function MUST use the same folder path as `getSyncthingExecutablePath()`. Both should use `"Syncthing binary-config/"` folder to ensure downloaded binaries are found correctly.

### BRAT Beta Version Handling
The plugin handles BRAT beta installations (e.g., `obsyncth-1.5.6-beta.7`) through dynamic folder detection that finds the actual plugin directory containing `main.js`. The testing release workflow automatically updates manifest.json with beta versions to maintain BRAT compatibility.

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

## Updated Push and Release Instructions

### Branching Strategy
- **`main` branch**: Used for stable releases. All production-ready code should be merged into this branch.
- **`dev` branch**: Used for testing releases. All new features and fixes should be pushed here first for testing.

### Pushing Changes
1. **For Testing Releases**:
   - Make changes and commit them to the `dev` branch.
   - Push the changes to the remote repository:
     ```bash
     git push origin dev
     ```
   - This will trigger the `testing-release.yaml` workflow to build and create beta releases with BRAT compatibility.

2. **For Stable Releases**:
   - After testing is complete, merge the `dev` branch into `main`:
     ```bash
     git checkout main
     git merge dev
     git push origin main
     ```
   - **Option A - Automatic Release**: If version was bumped, the `auto-release.yaml` workflow will automatically create a release.
   - **Option B - Manual Release**: Use the release script:
     ```bash
     npm run release:patch  # or minor/major
     ```

### GitHub Workflows (BRAT Compatible)
- **Testing Release Workflow** (`testing-release.yaml`):
  - Triggered on pushes to the `dev` branch.
  - Creates beta releases (e.g., `v1.5.5-beta.123`) for testing.
  - Automatically updates manifest.json with beta version to prevent BRAT version mismatches.
  - Uploads BRAT-compatible assets: `main.js`, `manifest.json`, `styles.css`.

- **Auto Release Workflow** (`auto-release.yaml`):
  - Triggered on pushes to the `main` branch when version changes are detected.
  - Automatically creates stable releases with proper BRAT-compatible assets.

- **Tag-based Release Workflow** (`stable-release.yaml`):
  - Triggered when version tags (e.g., `v1.5.5`) are pushed.
  - Creates final stable releases with comprehensive release notes.

- **Validation Workflow** (`validate.yaml`):
  - Validates workflow syntax and BRAT compatibility requirements.
  - Ensures `manifest.json` has all required fields.

### BRAT Compatibility Features
All workflows now ensure:
- ✅ Proper asset uploads (`main.js`, `manifest.json`, `styles.css`)
- ✅ BRAT installation instructions in release notes
- ✅ Repository format: `muxammadreza/Obsyncth`
- ✅ Cross-platform support documentation
- ✅ Semantic versioning compliance
- ✅ Automatic manifest.json version updates for beta releases

### Installation Methods for Users
**BRAT Installation (Recommended):**
1. Install BRAT plugin in Obsidian
2. Add repository: `muxammadreza/Obsyncth`
3. Enable the plugin

**Manual Installation:**
1. Download release assets from GitHub
2. Extract to `.obsidian/plugins/obsyncth/`
3. Enable in Community Plugins
