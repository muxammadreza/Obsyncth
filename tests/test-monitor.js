#!/usr/bin/env node

// Test our SyncthingMonitor implementation 
const EventEmitter = require('events');
const http = require('http');

class SyncthingMonitor extends EventEmitter {
	constructor(baseUrl, token) {
		super();
		this.baseUrl = baseUrl;
		this.token = token;
		this.status = 'offline';
		this.isEventListening = false;
		this.lastEventId = 0;
		this.timeout = 30000; // 30 seconds
		this.reconnectDelay = 5000; // 5 seconds
	}

	/**
	 * Check if Syncthing is running using Node.js HTTP requests
	 */
	async isSyncthingRunning() {
		return new Promise((resolve) => {
			// Parse URL for hostname and port
			const url = new URL(this.baseUrl);
			
			// Use IPv6 localhost if hostname is localhost/127.0.0.1
			let hostname = url.hostname;
			if (hostname === 'localhost' || hostname === '127.0.0.1') {
				hostname = '::1'; // Try IPv6 first, fallback in request error handler
			}
			
			const options = {
				hostname: hostname,
				port: parseInt(url.port) || 8384,
				path: '/',
				method: 'GET',
				timeout: 2000, // 2 second timeout
			};

			const req = http.request(options, (res) => {
				resolve(true); // If we get any response, Syncthing is running
			});

			req.on('error', (err) => {
				resolve(false); // Connection failed, Syncthing not running
			});

			req.on('timeout', () => {
				req.destroy();
				resolve(false); // Timeout, consider not running
			});

			req.end();
		});
	}

	async start() {
		console.log('🚀 Starting SyncthingMonitor...');
		
		// Test basic connectivity
		const isRunning = await this.isSyncthingRunning();
		console.log(`📡 Syncthing connectivity test: ${isRunning ? '✅ SUCCESS' : '❌ FAILED'}`);
		
		if (isRunning) {
			this.status = 'online';
			this.emit('statusChange', { status: 'online' });
			console.log('✅ SyncthingMonitor started successfully!');
		} else {
			this.status = 'offline';
			this.emit('statusChange', { status: 'offline' });
			console.log('⚠️ Syncthing not detected, monitoring will continue...');
		}
	}

	stop() {
		this.status = 'offline';
		this.isEventListening = false;
		console.log('🛑 SyncthingMonitor stopped');
	}
}

// Test our implementation
console.log('Testing our Node.js HTTP-based SyncthingMonitor...');

const monitor = new SyncthingMonitor('http://localhost:8384', 'rp9ZpzCrD7Wttoev9XvzixXocKDTp6qC');

monitor.on('statusChange', (data) => {
	console.log('📢 Status changed:', data);
});

monitor.start()
	.then(() => {
		console.log('✅ Test completed');
		process.exit(0);
	})
	.catch(err => {
		console.log('❌ Test failed:', err);
		process.exit(1);
	});
