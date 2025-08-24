#!/usr/bin/env node

// Test our new Syncthing download system
const https = require('https');

/**
 * Get latest release information from Syncthing GitHub API
 */
async function getLatestSyncthingRelease() {
	return new Promise((resolve, reject) => {
		const options = {
			hostname: 'api.github.com',
			port: 443,
			path: '/repos/syncthing/syncthing/releases/latest',
			method: 'GET',
			headers: {
				'User-Agent': 'Obsidian-Syncthing-Launcher-Plugin'
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
						version: releaseData.tag_name.replace('v', ''), // Remove 'v' prefix
						assets: releaseData.assets,
						html_url: releaseData.html_url
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
}

// Test the implementation
console.log('🔍 Testing Syncthing GitHub API integration...');

getLatestSyncthingRelease()
	.then(releaseInfo => {
		console.log('✅ Successfully fetched release info:');
		console.log(`📦 Version: ${releaseInfo.version}`);
		console.log(`🔗 Release URL: ${releaseInfo.html_url}`);
		console.log(`📁 Available assets: ${releaseInfo.assets.length}`);
		
		// Show platform-specific assets
		const platforms = ['linux-amd64', 'windows-amd64', 'macos-universal', 'macos-amd64', 'macos-arm64'];
		
		console.log('\n🎯 Platform-specific downloads:');
		platforms.forEach(platform => {
			const asset = releaseInfo.assets.find(a => a.name.includes(platform));
			if (asset) {
				console.log(`  ${platform}: ${asset.name}`);
				console.log(`    📥 ${asset.browser_download_url}`);
			}
		});
		
		// Determine what we would download for current platform
		let platformPattern = '';
		if (process.platform === 'win32') {
			const arch = process.arch === 'x64' ? 'amd64' : process.arch === 'arm64' ? 'arm64' : '386';
			platformPattern = `syncthing-windows-${arch}-v${releaseInfo.version}`;
		} else if (process.platform === 'darwin') {
			if (process.arch === 'arm64') {
				platformPattern = `syncthing-macos-arm64-v${releaseInfo.version}`;
			} else if (process.arch === 'x64') {
				platformPattern = `syncthing-macos-amd64-v${releaseInfo.version}`;
			} else {
				platformPattern = `syncthing-macos-universal-v${releaseInfo.version}`;
			}
		} else {
			const arch = process.arch === 'x64' ? 'amd64' : process.arch === 'arm64' ? 'arm64' : process.arch === 'arm' ? 'arm' : '386';
			platformPattern = `syncthing-linux-${arch}-v${releaseInfo.version}`;
		}
		
		const currentPlatformAsset = releaseInfo.assets.find(asset => 
			asset.name.startsWith(platformPattern)
		);
		
		console.log(`\n🖥️  Current platform (${process.platform} ${process.arch}):`);
		if (currentPlatformAsset) {
			console.log(`  ✅ Found: ${currentPlatformAsset.name}`);
			console.log(`  📥 URL: ${currentPlatformAsset.browser_download_url}`);
		} else {
			console.log(`  ❌ No asset found for pattern: ${platformPattern}`);
		}
		
		console.log('\n✅ Dynamic download system ready!');
	})
	.catch(error => {
		console.error('❌ Test failed:', error.message);
	});
