#!/usr/bin/env node

const https = require('https');

// Test the GitHub API and asset selection logic
async function testAssetSelection() {
    console.log('=== Testing Syncthing Asset Selection ===');
    console.log(`Platform: ${process.platform}, Architecture: ${process.arch}`);
    
    try {
        // Get latest release from GitHub API
        const releaseData = await new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.github.com',
                port: 443,
                path: '/repos/syncthing/syncthing/releases/latest',
                method: 'GET',
                headers: {
                    'User-Agent': 'Obsidian-Syncthing-Launcher-Test'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const releaseData = JSON.parse(data);
                        if (res.statusCode !== 200) {
                            reject(new Error(`GitHub API error: ${res.statusCode} - ${releaseData.message || 'Unknown error'}`));
                            return;
                        }
                        
                        resolve({
                            version: releaseData.tag_name.replace('v', ''),
                            assets: releaseData.assets
                        });
                    } catch (error) {
                        reject(new Error(`Failed to parse GitHub API response: ${error.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`Failed to fetch release info: ${error.message}`));
            });

            req.setTimeout(10000, () => {
                req.destroy();
                reject(new Error('GitHub API request timeout'));
            });

            req.end();
        });

        console.log(`\nLatest Syncthing version: ${releaseData.version}`);
        console.log(`\nAvailable assets:`);
        releaseData.assets.forEach((asset, index) => {
            console.log(`  ${index + 1}. ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)} MB)`);
        });

        // Test asset selection logic
        let platformPattern;
        let expectedExecutableName;
        
        if (process.platform === 'win32') {
            const arch = process.arch === 'x64' ? 'amd64' : process.arch === 'arm64' ? 'arm64' : '386';
            platformPattern = `syncthing-windows-${arch}-v${releaseData.version}`;
            expectedExecutableName = 'syncthing.exe';
        } else if (process.platform === 'darwin') {
            let arch;
            if (process.arch === 'arm64') {
                arch = 'arm64';
            } else if (process.arch === 'x64') {
                arch = 'amd64';
            } else {
                arch = 'universal';
            }
            platformPattern = `syncthing-macos-${arch}-v${releaseData.version}`;
            expectedExecutableName = 'syncthing';
        } else {
            const arch = process.arch === 'x64' ? 'amd64' : process.arch === 'arm64' ? 'arm64' : process.arch === 'arm' ? 'arm' : '386';
            platformPattern = `syncthing-linux-${arch}-v${releaseData.version}`;
            expectedExecutableName = 'syncthing';
        }

        console.log(`\nLooking for pattern: ${platformPattern}`);
        console.log(`Expected executable name: ${expectedExecutableName}`);

        // Find matching asset
        const matchingAsset = releaseData.assets.find(asset => 
            asset.name.startsWith(platformPattern)
        );

        if (matchingAsset) {
            console.log(`\n✅ Found matching asset: ${matchingAsset.name}`);
            console.log(`   Download URL: ${matchingAsset.browser_download_url}`);
            console.log(`   Size: ${(matchingAsset.size / 1024 / 1024).toFixed(1)} MB`);
        } else {
            console.log(`\n❌ No matching asset found for ${platformPattern}`);
            
            // Test fallback logic for macOS
            if (process.platform === 'darwin') {
                console.log(`\nTrying macOS fallbacks...`);
                
                // Try universal
                const universalPattern = `syncthing-macos-universal-v${releaseData.version}`;
                const universalAsset = releaseData.assets.find(asset => 
                    asset.name.startsWith(universalPattern)
                );
                
                if (universalAsset) {
                    console.log(`✅ Found universal build: ${universalAsset.name}`);
                } else {
                    console.log(`❌ No universal build found`);
                    
                    // Try amd64 for x64
                    if (process.arch === 'x64') {
                        const amd64Pattern = `syncthing-macos-amd64-v${releaseData.version}`;
                        const amd64Asset = releaseData.assets.find(asset => 
                            asset.name.startsWith(amd64Pattern)
                        );
                        
                        if (amd64Asset) {
                            console.log(`✅ Found amd64 build: ${amd64Asset.name}`);
                        } else {
                            console.log(`❌ No amd64 build found`);
                        }
                    }
                }
            }
        }

        console.log('\n=== Test Complete ===');
        return true;

    } catch (error) {
        console.error('Test failed:', error);
        return false;
    }
}

testAssetSelection().then(success => {
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('Test error:', error);
    process.exit(1);
});
