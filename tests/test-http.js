#!/usr/bin/env node

const http = require('http');

// Test our Node.js HTTP approach
function testSyncthingConnection() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: '::1',  // IPv6 localhost
            port: 8384,
            path: '/rest/system/status',
            method: 'GET',
            headers: {
                'X-API-Key': 'rp9ZpzCrD7Wttoev9XvzixXocKDTp6qC'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    console.log('✅ Node.js HTTP SUCCESS! Syncthing status:', {
                        myID: jsonData.myID,
                        uptime: jsonData.uptime,
                        systemVersion: jsonData.systemVersion,
                        startTime: jsonData.startTime
                    });
                    resolve(true);
                } catch (err) {
                    console.log('✅ HTTP Connection OK, but response parsing failed:', err.message);
                    console.log('Raw response:', data);
                    resolve(true);
                }
            });
        });

        req.on('error', (err) => {
            console.log('❌ Node.js HTTP FAILED:', err.message);
            reject(err);
        });

        req.setTimeout(5000, () => {
            req.destroy();
            console.log('❌ Request timeout');
            reject(new Error('Request timeout'));
        });

        req.end();
    });
}

// Run the test
console.log('Testing Node.js HTTP approach to Syncthing API...');
testSyncthingConnection()
    .then(() => console.log('Test completed successfully'))
    .catch(err => console.log('Test failed:', err.message));
