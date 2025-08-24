#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Simulate the plugin's executable detection logic
function getSyncthingExecutablePath() {
    const pluginPath = process.cwd() + '/';
    
    if (process.platform === 'win32') {
        return `${pluginPath}syncthing/syncthing.exe`;
    } else if (process.platform === 'darwin') {
        return `${pluginPath}syncthing/syncthing-macos`;
    } else {
        return `${pluginPath}syncthing/syncthing-linux`;
    }
}

async function checkExecutableExists() {
    try {
        const executablePath = getSyncthingExecutablePath();
        console.log(`Checking executable: ${executablePath}`);
        
        // Check if file exists
        if (!fs.existsSync(executablePath)) {
            console.log('❌ Executable file does not exist');
            return false;
        }
        
        // Get file info
        const stats = fs.statSync(executablePath);
        const mode = stats.mode;
        console.log(`File size: ${stats.size} bytes`);
        console.log(`File permissions: ${(mode & parseInt('777', 8)).toString(8)}`);
        
        // Check if file is executable
        try {
            fs.accessSync(executablePath, fs.constants.F_OK | fs.constants.X_OK);
            console.log('✅ File is executable');
            
            // Test version command if possible
            if (process.platform !== 'win32') {
                try {
                    await new Promise((resolve, reject) => {
                        exec(`"${executablePath}" --version`, { timeout: 5000 }, (error, stdout, stderr) => {
                            if (error) {
                                console.log('❌ Cannot execute binary:', error.message);
                                reject(error);
                            } else {
                                console.log('✅ Binary execution test successful');
                                console.log('Version output:', stdout.trim());
                                resolve(stdout);
                            }
                        });
                    });
                } catch (execError) {
                    console.log('❌ Binary execution failed:', execError.message);
                    return false;
                }
            }
            
            return true;
        } catch (permError) {
            console.log('❌ File exists but is not executable:', permError.message);
            
            // Try to fix permissions
            if (process.platform !== 'win32') {
                try {
                    console.log('Attempting to fix permissions...');
                    fs.chmodSync(executablePath, '755');
                    
                    // Remove quarantine on macOS
                    if (process.platform === 'darwin') {
                        await new Promise((resolve) => {
                            exec(`xattr -d com.apple.quarantine "${executablePath}"`, (error) => {
                                if (error && !error.message.includes('No such xattr')) {
                                    console.log('Note: Could not remove quarantine attribute:', error.message);
                                } else {
                                    console.log('✅ Removed macOS quarantine attribute');
                                }
                                resolve();
                            });
                        });
                    }
                    
                    // Try accessibility check again
                    fs.accessSync(executablePath, fs.constants.F_OK | fs.constants.X_OK);
                    console.log('✅ Permissions fixed successfully');
                    return true;
                } catch (fixError) {
                    console.log('❌ Could not fix permissions:', fixError.message);
                    return false;
                }
            }
            return false;
        }
    } catch (error) {
        console.error('❌ Error checking executable:', error);
        return false;
    }
}

console.log('=== Syncthing Executable Test ===');
console.log(`Platform: ${process.platform}`);
console.log(`Architecture: ${process.arch}`);
console.log('');

checkExecutableExists().then(result => {
    console.log('');
    console.log(`=== Test Result: ${result ? 'PASSED' : 'FAILED'} ===`);
    process.exit(result ? 0 : 1);
}).catch(error => {
    console.error('Test error:', error);
    process.exit(1);
});
