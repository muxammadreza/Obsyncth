// Test Syncthing startup sequence and responsiveness check
const http = require('http');

// Mock the waitForSyncthingStartup function
async function waitForSyncthingStartup(port) {
    const maxAttempts = 10; // Reduced for testing
    const delayMs = 500; // Faster for testing
    
    console.log('🔄 Testing Syncthing responsiveness check...');
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const result = await new Promise((resolve) => {
                const options = {
                    hostname: '127.0.0.1',
                    port: port,
                    path: '/rest/system/ping',
                    method: 'GET',
                    timeout: 1000,
                    headers: {
                        'User-Agent': 'Obsyncth-Plugin-Test'
                    }
                };
                
                const req = http.request(options, (res) => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                        console.log(`   Attempt ${attempt}: HTTP ${res.statusCode} - ${body.trim()}`);
                        resolve(res.statusCode === 200);
                    });
                });
                
                req.on('error', (error) => {
                    console.log(`   Attempt ${attempt}: Connection error - ${error.code || error.message}`);
                    resolve(false);
                });
                
                req.on('timeout', () => {
                    console.log(`   Attempt ${attempt}: Timeout`);
                    req.destroy();
                    resolve(false);
                });
                
                req.end();
            });
            
            if (result) {
                console.log(`✅ Syncthing responded successfully after ${attempt} attempts`);
                return true;
            }
            
            await new Promise(resolve => setTimeout(resolve, delayMs));
            
        } catch (error) {
            console.log(`   Attempt ${attempt}: Error - ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    
    console.log('⚠️ Syncthing did not respond within test timeout');
    return false;
}

// Test different startup scenarios
async function testStartupScenarios() {
    console.log('🧪 Testing Syncthing startup scenarios...\n');
    
    // Test 1: Check if Syncthing is already running
    console.log('📡 Test 1: Check current Syncthing availability on port 8384');
    const isRunning = await waitForSyncthingStartup('8384');
    
    if (isRunning) {
        console.log('✅ Syncthing is currently running and responsive');
        
        // Test 2: Test different endpoints to verify API health
        console.log('\n📡 Test 2: Testing additional endpoints');
        
        const endpoints = [
            '/rest/system/status',
            '/rest/system/version',
            '/rest/config'
        ];
        
        for (const endpoint of endpoints) {
            try {
                const result = await new Promise((resolve) => {
                    const options = {
                        hostname: '127.0.0.1',
                        port: '8384',
                        path: endpoint,
                        method: 'GET',
                        timeout: 2000
                    };
                    
                    const req = http.request(options, (res) => {
                        resolve(res.statusCode);
                    });
                    
                    req.on('error', () => resolve('error'));
                    req.on('timeout', () => { req.destroy(); resolve('timeout'); });
                    req.end();
                });
                
                console.log(`   ${endpoint}: ${result}`);
            } catch (error) {
                console.log(`   ${endpoint}: error`);
            }
        }
    } else {
        console.log('ℹ️ Syncthing is not currently running on port 8384');
        console.log('   This is expected if Syncthing hasn\'t been started yet.');
    }
    
    console.log('\n🎯 Startup sequence test completed!');
    console.log('\n💡 Improvements made:');
    console.log('   ✅ Extended startup delay for first-run (8 seconds vs 2 seconds)');
    console.log('   ✅ Added Syncthing responsiveness check before monitoring');
    console.log('   ✅ Better handling of missing API key scenario');
    console.log('   ✅ Helpful notices for first-time users');
    console.log('   ✅ Robust ping endpoint checking');
}

testStartupScenarios();
