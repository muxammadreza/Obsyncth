# Obsyncth

**Seamless Obsidian-Syncthing Integration Plugin**

Obsyncth provides effortless vault synchronization across all your devices by integrating Syncthing directly into Obsidian. Whether you're on desktop or mobile, Obsyncth automatically manages Syncthing binaries and provides real-time sync status monitoring.

## ✨ Key Features

- **🚀 Zero-Configuration Setup**: Automatic Syncthing binary download and installation
- **📱 Cross-Platform Excellence**: Full support for Windows, macOS, Linux, iOS, and Android
- **🔄 Real-Time Monitoring**: Live sync status with progress indicators in your status bar
- **⚡ Smart Auto-Management**: Configurable auto-start/stop with Obsidian launch/close
- **🌐 Flexible Connection Modes**: Local binary execution, remote connections, or Docker containers
- **🎯 Mobile-Optimized**: Intelligent mobile detection with remote Syncthing support
- **🔒 Secure Integration**: Direct API communication with your Syncthing instances

## 🛠️ Quick Start

### Installation
1. Download the latest release from [GitHub Releases](https://github.com/muxammadreza/Obsyncth/releases)
2. Extract to your vault's `.obsidian/plugins/` directory
3. Enable "Obsyncth" in Obsidian's Community Plugins settings
4. Click the status icon (⚫) in your status bar to start Syncthing

### Initial Configuration
1. **Access Syncthing Web UI**: Navigate to [127.0.0.1:8384](http://127.0.0.1:8384) after starting
2. **Configure Your Vault**: 
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

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues, feature requests, or pull requests.

## � License

MIT License - see [LICENSE](LICENSE) for details.

## 👨‍💻 Author

Created by **Reza Mir** ([@muxammadreza](https://github.com/muxammadreza))

---

*Built with ❤️ for the Obsidian community*
