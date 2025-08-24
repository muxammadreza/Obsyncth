# Obsyncth

## Obsyncth

**Seamless Obsidian-Syncthing integration** - Cross-platform vault synchronization plugin with automatic binary management and real-time monitoring.

Obsyncth provides effortless vault synchronization across all your devices by integrating Syncthing directly into Obsidian. Whether you're on desktop or mobile, Obsyncth automatically manages Syncthing binaries and provides real-time sync status monitoring.

## ✨ Key Features

- **🚀 Zero-Configuration Setup**: Automatic Syncthing binary download and installation
- **📱 Cross-Platform Excellence**: Full support for Windows, macOS, Linux, iOS, and Android
- **🔄 Real-Time Monitoring**: Live sync status with progress indicators in your status bar
- **⚡ Smart Auto-Management**: Configurable auto-start/stop with Obsidian launch/close
- **🌐 Flexible Connection Modes**: Local binary execution, remote connections, or Docker containers
- **🎯 Mobile-Optimized**: Intelligent mobile detection with remote Syncthing support
- **🔒 Secure Integration**: Direct API communication with your Syncthing instances

## 🛠️ Installation

### Option 1: BRAT (Beta Reviewers Auto-update Tester) - Recommended
1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat) in Obsidian
2. Open BRAT settings and click "Add Beta Plugin"
3. Enter this repository: `muxammadreza/Obsyncth`
4. Enable "Obsyncth" in your Community Plugins settings
5. BRAT will automatically keep the plugin updated

### Option 2: Manual Installation
1. Download the latest release from [GitHub Releases](https://github.com/muxammadreza/Obsyncth/releases)
2. Extract `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/obsyncth/` directory
3. Enable "Obsyncth" in Obsidian's Community Plugins settings

## 🚀 Quick Start

### Getting Started
1. Click the status icon (⚫) in your status bar to start Syncthing
2. **Initial Configuration**
   - **Access Syncthing Web UI**: Navigate to [127.0.0.1:8384](http://127.0.0.1:8384) after starting 
   - **Configure Your Vault**: 
     - Add your vault directory as a new folder in Syncthing
     - Add `obsyncth` and `Syncthing binary-config` to ignore patterns
3. **Plugin Settings**:
   - Copy your Syncthing API key from the web UI
   - Paste the vault folder ID from Syncthing into plugin settings
   - Configure auto-start preferences as desired

### Mobile Setup
For iOS/Android devices, enable "Mobile Mode" in settings and configure your remote Syncthing URL to connect to a desktop or server instance.

## 🐳 Docker Support

Run Syncthing in an isolated container by enabling "Use Docker" in settings. This provides enhanced security by limiting Syncthing's file system access to only your vault directory.

## 📁 Project Structure

```
Obsyncth/
├── src/                          # Source code
│   ├── main.ts                   # Main plugin code
│   └── styles.css                # Plugin styles
├── config/                       # Configuration files
│   ├── esbuild.config.mjs        # Build configuration
│   ├── tsconfig.json             # TypeScript configuration
│   ├── .eslintrc                 # ESLint configuration
│   ├── .eslintignore             # ESLint ignore patterns
│   ├── .editorconfig             # Editor configuration
│   └── .npmrc                    # NPM configuration
├── build/                        # Build scripts
│   └── version-bump.mjs          # Version management script
├── scripts/                      # Release and utility scripts
│   └── release.sh               # Release automation script
├── tests/                        # Test files and debugging utilities
│   ├── test-*.js                # Individual test scripts
│   ├── debug-executable.js      # Debug utilities
│   └── README.md                # Testing documentation
├── docker/                       # Docker configuration
│   ├── docker-compose.yaml      # Docker Compose setup
│   ├── Dockerfile               # Container definition
│   └── nginx.conf               # Nginx proxy configuration
├── .github/                      # GitHub Actions workflows
│   ├── workflows/               # CI/CD automation
│   └── copilot-instructions.md  # AI assistant instructions
├── Syncthing binary-config/      # Syncthing binaries and runtime
│   ├── syncthing-linux          # Linux executable
│   ├── syncthing-macos          # macOS executable
│   ├── syncthing.exe            # Windows executable
│   └── syncthing-config/        # Runtime configuration (gitignored)
├── manifest.json                 # Obsidian plugin manifest
├── versions.json                 # Version compatibility info
├── package.json                  # Node.js dependencies and scripts
└── README.md                     # This file
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues, feature requests, or pull requests.

## � License

MIT License - see [LICENSE](LICENSE) for details.

## 👨‍💻 Author

Created by **Reza Mir** ([@muxammadreza](https://github.com/muxammadreza))

---

*Built with ❤️ for the Obsidian community*
