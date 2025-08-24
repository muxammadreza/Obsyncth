#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Test the improved executable finding logic
function testExecutableFinder() {
    console.log('=== Testing Improved Executable Finder ===');
    
    // Simulate the directory structure from the logs
    const testDir = './test-syncthing-extract';
    const syncthingSubdir = path.join(testDir, 'syncthing-macos-arm64-v2.0.3');
    const etcDir = path.join(syncthingSubdir, 'etc', 'firewall-ufw');
    
    try {
        // Create test directory structure
        fs.mkdirSync(etcDir, { recursive: true });
        
        // Create fake small config file (like the 175-byte file we found)
        const fakeConfigFile = path.join(etcDir, 'syncthing');
        fs.writeFileSync(fakeConfigFile, 'This is a fake UFW config file that should NOT be selected as the executable.');
        
        // Create fake large binary file (like the real Syncthing executable)
        const realExecutable = path.join(syncthingSubdir, 'syncthing');
        const largeBinaryData = Buffer.alloc(10 * 1024 * 1024, 'binary-data'); // 10MB fake binary
        fs.writeFileSync(realExecutable, largeBinaryData);
        
        console.log(`Created test structure:`);
        console.log(`  Small config file: ${fakeConfigFile} (${fs.statSync(fakeConfigFile).size} bytes)`);
        console.log(`  Large binary file: ${realExecutable} (${fs.statSync(realExecutable).size} bytes)`);
        
        // Test the finder logic
        const executableName = 'syncthing';
        
        const findExecutable = (dir) => {
            const items = fs.readdirSync(dir);
            console.log(`Searching in ${dir}: found items: ${items.join(', ')}`);
            
            // First pass: look for the executable in the current directory (prioritize root level)
            for (const item of items) {
                const itemPath = path.join(dir, item);
                const stat = fs.statSync(itemPath);
                
                if (stat.isFile() && item === executableName) {
                    // Additional validation - check if it's actually a binary executable
                    try {
                        const sizeInMB = (stat.size / 1024 / 1024).toFixed(1);
                        console.log(`Found potential executable: ${itemPath} (${stat.size} bytes = ${sizeInMB} MB)`);
                        
                        // Syncthing binaries are typically 10+ MB, so anything under 1MB is likely a config file
                        if (stat.size > 1024 * 1024) { // > 1MB
                            console.log(`✅ Found legitimate executable: ${itemPath}`);
                            return itemPath;
                        } else {
                            console.log(`⚠️ Skipping small file (likely config): ${itemPath} (${stat.size} bytes)`);
                        }
                    } catch (statError) {
                        console.log(`Could not stat file: ${itemPath}`, statError);
                    }
                }
            }
            
            // Second pass: search subdirectories if we didn't find it at this level
            for (const item of items) {
                const itemPath = path.join(dir, item);
                const stat = fs.statSync(itemPath);
                
                if (stat.isDirectory()) {
                    const found = findExecutable(itemPath);
                    if (found) return found;
                }
            }
            return null;
        };
        
        console.log('\n=== Running Finder Test ===');
        const foundExecutable = findExecutable(testDir);
        
        if (foundExecutable) {
            console.log(`\n✅ SUCCESS: Found correct executable: ${foundExecutable}`);
            const stats = fs.statSync(foundExecutable);
            console.log(`   Size: ${stats.size} bytes (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
            
            // Verify it's the right one
            if (foundExecutable.includes('syncthing-macos-arm64-v2.0.3/syncthing') && stats.size > 1024 * 1024) {
                console.log('✅ CORRECT: Found the large binary file, not the small config file!');
                return true;
            } else {
                console.log('❌ WRONG: Found incorrect file');
                return false;
            }
        } else {
            console.log('\n❌ FAILED: No executable found');
            return false;
        }
        
    } catch (error) {
        console.error('Test error:', error);
        return false;
    } finally {
        // Cleanup
        try {
            if (fs.existsSync(testDir)) {
                fs.rmSync(testDir, { recursive: true, force: true });
                console.log('\nCleaned up test directory');
            }
        } catch (cleanupError) {
            console.log('Cleanup error (non-fatal):', cleanupError);
        }
    }
}

// Run the test
const success = testExecutableFinder();
console.log(`\n=== Test Result: ${success ? 'PASSED' : 'FAILED'} ===`);
process.exit(success ? 0 : 1);
