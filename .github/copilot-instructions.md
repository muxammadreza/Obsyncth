# Obsyncth - AI Coding Agent Instructions

## Project Overview
Obsyncth is a cross-platform Obsidian plugin that integrates Syncthing file synchronization. It features conditional Node.js imports for mobile compatibility, a sophisticated tabbed settings interface, robust binary/configuration management with dynamic version handling, and comprehensive testing infrastructure.

**Key Stats**: ~3,335 lines of TypeScript code in main plugin file, 12 test scripts, 5 GitHub Actions workflows, comprehensive Docker support.

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
npm run dev        # Watch mode with source maps (uses config/esbuild.config.mjs)
npm run build      # Production build with TypeScript checking (config/tsconfig.json)
npm run build:ci   # CI-friendly build (TypeScript errors as warnings)
npm run version    # Bump version across manifest.json and versions.json (build/version-bump.mjs)
```

**Important**: The build system automatically:
- Compiles `src/main.ts` → `main.js` (root directory)
- Copies `src/styles.css` → `styles.css` (root directory)
- Uses configuration files from `config/` folder
- Ensures BRAT compatibility with proper file placement

### Binary Management System
Syncthing executables are stored in `"Syncthing binary-config/"` with platform-specific naming:
- Windows: `syncthing.exe`
- macOS: `syncthing-macos` 
- Linux: `syncthing-linux`

The binary management system includes:
- **Intelligent Asset Selection**: Automatically selects correct platform-specific archives from GitHub releases
- **Robust Extraction**: Handles both ZIP (Windows/macOS) and TAR.GZ (Linux) archives with recursive executable finding
- **Executable Validation**: Verifies file size, permissions, and architecture compatibility
- **Smart Cleanup**: Removes extracted directory structure while preserving renamed executables
- **Fallback Handling**: Graceful degradation when auto-download fails

Binary download/extraction uses platform-specific archive handling with executable validation. The `extractAndInstallSyncthing()` function MUST use the same folder path as `getSyncthingExecutablePath()` to ensure downloaded binaries are found correctly.

### Configuration Management
Syncthing configuration is stored in `"Syncthing binary-config/syncthing-config/"` using the `--home` parameter:

```typescript
const configDir = `${this.getPluginAbsolutePath()}Syncthing binary-config/syncthing-config`;
const args = ['--home', configDir, '--no-browser', '--gui-address', `127.0.0.1:${port}`];
```

**Enhanced Directory Creation**: The system includes robust directory creation with proper error handling:
- Creates parent `Syncthing binary-config/` directory first
- Then creates `syncthing-config/` subdirectory
- Verifies each step before proceeding
- Handles filesystem delays and permission issues
- Provides descriptive error messages for troubleshooting

### Settings Persistence
Settings auto-save triggers monitor restart:
```typescript
async saveSettings() {
  await this.saveData(this.settings);
  this.monitor.stopMonitoring();
  setTimeout(() => this.startStatusMonitoring(), 1000);
}
```

**Auto-Save Implementation**: All configuration fields have immediate persistence:
- API key input with auto-save on change
- Folder ID input with auto-save on change  
- Checkbox settings with immediate persistence
- Prevents configuration loss when switching tabs
- No manual save button required

### Connection Modes
Three operational modes with different URL resolution:
1. **Desktop**: `http://127.0.0.1:8384` (local binary)
2. **Mobile/Remote**: Uses `settings.remoteUrl`
3. **Docker**: `http://127.0.0.1:8380/` (containerized with CORS proxy)

**Network Communication**: Uses IPv4 addressing exclusively to prevent connection issues:
- All localhost connections forced to `127.0.0.1` (IPv4)
- Converts any IPv6 `::1` addresses to IPv4 `127.0.0.1`
- Prevents `ECONNREFUSED ::1:8384` errors
- Consistent addressing across all monitoring methods

## File Organization

The codebase follows a clean, organized structure:

```
Obsyncth/
├── src/                          # Source code
│   ├── main.ts                   # Main plugin TypeScript code (~2800 lines)
│   └── styles.css                # Plugin CSS styles
├── config/                       # Configuration files
│   ├── esbuild.config.mjs        # Build configuration with Obsidian externals
│   ├── tsconfig.json             # TypeScript configuration
│   ├── .eslintrc                 # ESLint linting rules
│   ├── .eslintignore             # ESLint ignore patterns
│   ├── .editorconfig             # Editor configuration
│   └── .npmrc                    # NPM configuration
├── build/                        # Build scripts and utilities
│   └── version-bump.mjs          # Version management script
├── tests/                        # Test files and debugging utilities
│   ├── test-*.js                 # Individual test scripts for different functionality
│   ├── debug-executable.js       # Debug utilities for executable detection
│   └── README.md                 # Testing documentation and instructions
├── scripts/                      # Release and deployment scripts
│   └── release.sh               # Automated release with git tagging
├── docker/                       # Docker configuration
│   ├── docker-compose.yaml      # Docker Compose stack for containerized Syncthing
│   ├── Dockerfile               # Container definition
│   └── nginx.conf               # Nginx proxy configuration
├── .github/                      # GitHub Actions and documentation
│   ├── workflows/               # CI/CD automation workflows
│   └── copilot-instructions.md  # AI assistant development guidelines
├── Syncthing binary-config/      # Syncthing binaries and runtime
│   ├── syncthing-linux          # Linux executable
│   ├── syncthing-macos          # macOS executable
│   ├── syncthing.exe            # Windows executable
│   └── syncthing-config/        # Runtime configuration (gitignored)
├── manifest.json                 # Obsidian plugin manifest (sync with package.json version)
├── versions.json                 # Version compatibility information
├── package.json                  # Node.js dependencies and build scripts
└── main.js                       # Built plugin output (generated, not committed)
```

### Build System
The build system automatically handles the file structure:
- **Source**: TypeScript code is in `src/main.ts`
- **Styles**: CSS is in `src/styles.css` and automatically copied to root during build
- **Configuration**: All config files are in `config/` folder
- **Output**: Built files (`main.js`, `styles.css`) are generated in root for BRAT compatibility

## Common Issues & Solutions

### TypeScript Errors
The build shows TypeScript warnings about implicit 'any' types - these are **non-blocking** and expected due to conditional Node.js imports. Focus on runtime functionality over strict typing.

### Binary Folder Path Consistency
**Critical**: The `extractAndInstallSyncthing()` function MUST use the same folder path as `getSyncthingExecutablePath()`. Both should use `"Syncthing binary-config/"` folder to ensure downloaded binaries are found correctly.

### BRAT Beta Version Handling
The plugin handles BRAT beta installations (e.g., `obsyncth-1.5.6-beta.7`) through dynamic folder detection that finds the actual plugin directory containing `main.js`. The testing release workflow automatically updates manifest.json with beta versions to maintain BRAT compatibility.

### Mobile Compatibility
- All Node.js operations must check `detectMobilePlatform()`
- Provide meaningful fallbacks for mobile users
- Use `SimpleEventEmitter` class when Node.js EventEmitter unavailable

### Status Monitoring
The monitoring system uses different approaches:
- Desktop: Node.js HTTP polling of localhost with IPv4 addressing
- Mobile: Fetch API to remote Syncthing instance

Always test both modes when modifying status-related code.

### Network Connectivity Issues
**IPv4 vs IPv6**: The plugin forces IPv4 localhost (`127.0.0.1`) for all local connections to prevent `ECONNREFUSED ::1:8384` errors. All hostname resolution converts IPv6 `::1` back to IPv4 `127.0.0.1`.

### Directory Creation Edge Cases
The enhanced directory creation system handles:
- Parent directory creation before subdirectories
- Filesystem sync delays and race conditions  
- Permission validation and error recovery
- Descriptive error messages for troubleshooting

### Testing Infrastructure
The `tests/` folder contains comprehensive test scripts and debugging utilities:
- **test-asset-selection.js**: Tests GitHub API asset selection and platform-specific filtering
- **test-config-path.js**: Tests configuration path construction and validation
- **test-directory-creation.js**: Tests robust directory creation with error handling
- **test-download.js**: Tests Syncthing binary download and extraction functionality
- **test-edge-cases.js**: Tests edge cases, error conditions, and recovery scenarios
- **test-executable-finder.js**: Tests recursive executable detection and validation logic
- **test-executable.js**: Tests executable permissions, architecture, and functionality
- **test-http.js**: Tests HTTP communication, IPv4/IPv6 handling, and API connectivity
- **test-monitor.js**: Tests status monitoring, event handling, and connection management
- **test-startup-sequence.js**: Tests plugin initialization and Syncthing startup detection
- **debug-executable.js**: Debug utility for platform detection and path resolution

Tests are currently standalone Node.js scripts. Run them individually:
```bash
node tests/test-executable.js
node tests/test-monitor.js
# etc.
```

**Test Coverage Areas**:
- Platform detection and conditional imports
- Binary management and extraction
- Directory creation and permissions
- Network connectivity and monitoring
- Error handling and edge cases
- GitHub API integration
- Configuration management

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

- **Stable Release Workflow** (`stable-release.yaml`):
  - Triggered when version tags (e.g., `v1.5.5`) are pushed.
  - Creates final stable releases with comprehensive release notes.

- **Manual Release Workflow** (`manual-release.yaml`):
  - Allows manual version specification and release creation.
  - Supports semantic versioning (patch, minor, major).

- **Validation Workflow** (`validate.yaml`):
  - Validates workflow syntax and BRAT compatibility requirements.
  - Ensures `manifest.json` has all required fields.
  - Runs on PR and push to main/dev branches affecting workflows.

### BRAT Compatibility Features
All workflows now ensure:
- ✅ Proper asset uploads (`main.js`, `manifest.json`, `styles.css`)
- ✅ BRAT installation instructions in release notes
- ✅ Repository format: `muxammadreza/Obsyncth`
- ✅ Cross-platform support documentation
- ✅ Semantic versioning compliance
- ✅ Automatic manifest.json version updates for beta releases

### Release Management
**Release Script** (`scripts/release.sh`):
- Automated release management with BRAT compatibility
- Handles version bumping across all files (package.json, manifest.json, versions.json)
- Validates build artifacts and creates GitHub releases
- Supports semantic versioning (patch, minor, major)
- Git tagging and push automation

**Version Management** (`build/version-bump.mjs`):
- Synchronizes version numbers across manifest.json and versions.json
- Maintains compatibility matrix for different Obsidian versions
- Integrates with npm version commands

### Installation Methods for Users
**BRAT Installation (Recommended):**
1. Install BRAT plugin in Obsidian
2. Add repository: `muxammadreza/Obsyncth`
3. Enable the plugin

**Manual Installation:**
1. Download release assets from GitHub
2. Extract to `.obsidian/plugins/obsyncth/`
3. Enable in Community Plugins

## Docker Support
**Docker Compose Configuration** (`docker/docker-compose.yaml`):
- Containerized Syncthing with CORS proxy setup
- Nginx proxy for web interface access
- Isolated environment with configurable user permissions
- Environment-based configuration support

**Key Features**:
- Port 8380 for plugin access (vs 8384 for direct Syncthing)
- CORS headers for cross-origin requests
- User/group ID configuration for file permissions
- Automatic restart policies

## Dependencies and Package Management
**Core Dependencies**:
- `axios`: HTTP client for API communication
- `tree-kill`: Process management for Syncthing cleanup

**Development Dependencies**:
- TypeScript ecosystem with strict null checks
- ESLint configuration with TypeScript rules
- esbuild for fast compilation and bundling
- Node.js type definitions for development

**Package Scripts**:
- `dev`: Watch mode development with esbuild
- `build`: Production build with TypeScript checking
- `build:ci`: CI-friendly build (warnings only)
- `version`: Automated version management
- `release:*`: Semantic version release scripts
