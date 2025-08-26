#!/usr/bin/env node

// Test platform detection improvements
function detectMobilePlatform() {
	// Simulate different user agents to test detection
	const testCases = [
		'Mozilla/5.0 (iPad; CPU OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1',
		'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1',
		'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
	];
	
	console.log('Testing platform detection improvements:\n');
	
	testCases.forEach((userAgent, index) => {
		// Mock navigator for testing
		global.navigator = { userAgent, vendor: '', opera: undefined };
		global.window = { app: { isMobile: false } };
		
		// Test detection
		const isMobile = /iPad|iPhone|iPod|android|Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
		
		// Test enhanced platform info
		const userAgentLower = userAgent.toLowerCase();
		let platform = 'unknown';
		let arch = 'unknown';
		
		if (/ipad/.test(userAgentLower)) {
			platform = 'ios';
			arch = 'arm64';
		} else if (/iphone|ipod/.test(userAgentLower)) {
			platform = 'ios';
			arch = 'arm64';
		} else if (/android/.test(userAgentLower)) {
			platform = 'android';
			if (/arm64|aarch64/.test(userAgentLower)) {
				arch = 'arm64';
			} else if (/arm/.test(userAgentLower)) {
				arch = 'arm';
			} else {
				arch = 'arm64'; // Default for modern Android
			}
		} else if (/windows/.test(userAgentLower)) {
			platform = 'win32';
			arch = 'x64';
		} else if (/macintosh|mac os x/.test(userAgentLower)) {
			platform = 'darwin';
			arch = 'x64';
		}
		
		const deviceType = ['iPad', 'iPhone', 'Android phone', 'Windows PC', 'Mac'][index];
		
		console.log(`${index + 1}. ${deviceType}:`);
		console.log(`   Mobile: ${isMobile}`);
		console.log(`   Platform: ${platform}`);
		console.log(`   Architecture: ${arch}`);
		console.log('');
	});
}

detectMobilePlatform();
