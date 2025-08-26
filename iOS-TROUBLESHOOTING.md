# iOS Troubleshooting Guide for Obsyncth

## Common Issues and Solutions

### 1. Encryption Mismatch Error
**Error**: `"remote expects to exchange encrypted data, but is configured for plain data"`

**Root Cause**: Different devices have inconsistent encryption settings for the same folder.

**Solutions**:
1. **Check Device Analysis**: Use "🔬 Deep Device Analysis" to identify which devices have mismatched encryption
2. **Force Consistency**: Use "⚡ Force Consistent Encryption" to make all devices use the same settings
3. **Manual Fix**: Ensure all devices have identical encryption settings in the Configuration tab

### 2. iOS Hidden File Access

**Problem**: iOS cannot see or sync the `.obsidian` folder due to sandboxing.

**Solutions**:
1. **Use the iOS Folder Picker**: In settings, click "📁 Choose Folders to Sync"
2. **Select "Entire Vault"**: This includes hidden folders like `.obsidian`
3. **Enable "Sync hidden files"**: Check this option in iOS Compatibility settings
4. **Vault Location**: Ensure your vault is in a Files app accessible location:
   - iCloud Drive/Obsidian/
   - On My iPhone/Obsidian/
   - Documents folder

### 3. Working Copy App Approach

The plugin implements the same file access strategy as Working Copy:

1. **Document Provider Extensions**: Access files through iOS document provider
2. **Custom File Picker**: Shows hidden folders that standard iOS pickers hide
3. **Proper Sandboxing**: Respects iOS security while accessing necessary files
4. **Files App Integration**: Uses extended permissions to access hidden folders

### 4. Deep Configuration Analysis

Use these tools to diagnose issues:

- **🔍 Check & Fix Encryption Mismatch**: Basic encryption consistency check
- **🔬 Deep Device Analysis**: Comprehensive device and folder analysis
- **🧹 Remove Hardcoded Encryption**: Clears any forced encryption settings
- **⚡ Force Consistent Encryption**: Nuclear option to force all devices to match

### 5. iOS Setup Checklist

✅ Vault in Files app accessible location  
✅ Remote Syncthing URL configured  
✅ Same encryption settings on all devices  
✅ Hidden files sync enabled  
✅ Folder picker used to select sync folders  
✅ "Force consistent encryption" enabled  

### 6. Advanced Troubleshooting

If the error persists:

1. **Check Device IDs**: Ensure all devices are properly paired
2. **Restart Syncthing**: On all devices after making changes
3. **Clear Configuration**: Remove and re-add folders with consistent settings
4. **Server Logs**: Check Syncthing logs on your Linux server for detailed errors

### 7. Mobile Mode vs Desktop Mode

- **iPad (Mobile Mode)**: Connects remotely to server, cannot run local Syncthing
- **Mac (Desktop Mode)**: Runs local Syncthing instance, can share folders
- **Linux Server**: Runs Syncthing server, manages folder sharing

Ensure all three use the same encryption settings for shared folders.
