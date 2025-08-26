/*
 * Obsyncth - Seamless Obsidian-Syncthing Integration
 * Copyright (c) 2024-2025 Reza Mir
 * 
 * This plugin provides cross-platform vault synchronization by integrating
 * Syncthing directly into Obsidian with automatic binary management and
 * real-time status monitoring.
 * 
 * Licensed under MIT License - see LICENSE file for details.
 * GitHub: https://github.com/muxammadreza/Obsyncth
 * Author: Reza Mir <rmirbast@gmail.com>
 */

import { App, FileSystemAdapter, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { IOSFileManager, IOSDirectoryListing, IOSFileItem } from './ios-file-manager';

// Platform detection for mobile - must work without any Node.js APIs
function detectMobilePlatform(): boolean {
	// Check if we're running in Obsidian mobile
	if ((window as any).app?.isMobile) {
		return true;
	}
	
	// Check user agent for mobile platforms
	const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera || '';
	
	// iOS detection
	if (/iPad|iPhone|iPod/.test(userAgent)) {
		return true;
	}
	
	// Android detection
	if (/android/i.test(userAgent)) {
		return true;
	}
	
	// Additional mobile checks
	if (/Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) {
		return true;
	}
	
	return false;
}

// Get detailed platform information for mobile devices
function getMobilePlatformInfo(): { platform: string; arch: string } {
	const userAgent = (navigator.userAgent || navigator.vendor || (window as any).opera || '').toLowerCase();
	
	// iOS detection with better specificity
	if (/ipad/.test(userAgent)) {
		return { platform: 'ios', arch: 'arm64' };
	}
	if (/iphone|ipod/.test(userAgent)) {
		return { platform: 'ios', arch: 'arm64' };
	}
	
	// Android detection with architecture hints
	if (/android/.test(userAgent)) {
		// Try to detect architecture from user agent
		if (/arm64|aarch64/.test(userAgent)) {
			return { platform: 'android', arch: 'arm64' };
		} else if (/arm/.test(userAgent)) {
			return { platform: 'android', arch: 'arm' };
		} else if (/x86_64|x64/.test(userAgent)) {
			return { platform: 'android', arch: 'x64' };
		} else {
			return { platform: 'android', arch: 'arm64' }; // Default for modern Android
		}
	}
	
	// Fallback for other mobile platforms
	return { platform: 'mobile', arch: 'unknown' };
}

// Conditional imports for desktop-only functionality
let spawn: any, exec: any, readFileSync: any, writeFileSync: any, http: any;
let fs: any, path: any, childProcess: any, treeKill: any, https: any, urlModule: any;
let EventEmitter: any;

// Safe platform detection that works on both desktop and mobile
const platformInfo = {
	platform: 'unknown',
	arch: 'unknown',
	isDesktop: false
};

// Simple EventEmitter implementation for mobile platforms
class SimpleEventEmitter {
	private events: { [key: string]: Function[] } = {};
	
	on(event: string, listener: Function) {
		if (!this.events[event]) {
			this.events[event] = [];
		}
		this.events[event].push(listener);
	}
	
	off(event: string, listener: Function) {
		if (!this.events[event]) return;
		const index = this.events[event].indexOf(listener);
		if (index > -1) {
			this.events[event].splice(index, 1);
		}
	}
	
	emit(event: string, ...args: any[]) {
		if (!this.events[event]) return;
		this.events[event].forEach(listener => {
			try {
				listener(...args);
			} catch (error) {
				console.error('Event listener error:', error);
			}
		});
	}
}

try {
	// Only load Node.js modules on desktop platforms
	if (!detectMobilePlatform()) {
		childProcess = require("child_process");
		fs = require('fs');
		path = require('path');
		http = require('http');
		https = require('https');
		urlModule = require('url');
		treeKill = require('tree-kill');
		EventEmitter = require('events').EventEmitter;
		
		spawn = childProcess.spawn;
		exec = childProcess.exec;
		readFileSync = fs.readFileSync;
		writeFileSync = fs.writeFileSync;
		
		// Safe access to process info
		platformInfo.platform = (typeof process !== 'undefined' && process.platform) || 'unknown';
		platformInfo.arch = (typeof process !== 'undefined' && process.arch) || 'unknown';
		platformInfo.isDesktop = true;
	} else {
		// On mobile, provide no-op functions and simple EventEmitter
		console.log('Mobile platform detected - Node.js functionality disabled');
		EventEmitter = SimpleEventEmitter;
		
		// Platform info for mobile (iOS/Android) - use enhanced detection
		const mobileInfo = getMobilePlatformInfo();
		platformInfo.platform = mobileInfo.platform;
		platformInfo.arch = mobileInfo.arch;
		platformInfo.isDesktop = false;
		
		http = {
			request: () => { 
				console.warn('HTTP requests not available on mobile platform');
				return {
					on: () => {},
					end: () => {},
					write: () => {}
				};
			}
		};
		fs = {
			existsSync: () => false,
			readFileSync: () => '',
			writeFileSync: () => {},
			accessSync: () => { throw new Error('File access not available on mobile'); },
			constants: { F_OK: 0, X_OK: 1 },
			chmodSync: () => {}
		};
		childProcess = {
			spawn: () => { 
				console.warn('Process spawning not available on mobile');
				return { pid: -1, on: () => {}, kill: () => {} };
			},
			exec: () => { 
				console.warn('Process execution not available on mobile');
			}
		};
	}
} catch (error) {
	// Fallback - these modules are not available, probably mobile
	console.log('Desktop-only modules not available:', error);
	EventEmitter = SimpleEventEmitter;
	
	// Use enhanced mobile detection for fallback too
	const mobileInfo = getMobilePlatformInfo();
	platformInfo.platform = mobileInfo.platform;
	platformInfo.arch = mobileInfo.arch;
	platformInfo.isDesktop = false;
}

interface Settings {
	syncthingApiKey: string;
	vaultFolderID: string;
	startOnObsidianOpen: boolean;
	stopOnObsidianClose: boolean;
	useDocker: boolean;
	remoteUrl: string;
	mobileMode: boolean;
	remoteUsername: string;
	remotePassword: string;
	encryptionEnabled: boolean;
	encryptionPassword: string;
	allowHiddenFiles: boolean;
	selectedVaultPath: string;
	syncedFiles: { [path: string]: boolean };
	ignorePatterns: string[];
}

const DEFAULT_SETTINGS: Settings = {
	syncthingApiKey: '',
	vaultFolderID: '',
	startOnObsidianOpen: false,
	stopOnObsidianClose: false,
	useDocker: false,
	remoteUrl: 'http://127.0.0.1:8384',
	mobileMode: false, // Will be auto-detected and set to true on mobile platforms
	remoteUsername: '',
	remotePassword: '',
	encryptionEnabled: false,
	encryptionPassword: '',
	allowHiddenFiles: true,
	selectedVaultPath: '',
	syncedFiles: {},
	ignorePatterns: [],
}

interface SyncthingEvent {
	id: number;
	type: string;
	time: string;
	data: any;
}

interface Connection {
	connected: boolean;
}

interface ConnectionsResponse {
	connections: { [key: string]: Connection };
}

interface FileItem {
	name: string;
	path: string;
	type: 'file' | 'folder';
	size?: number;
	isHidden: boolean;
	isSelected: boolean;
	children?: FileItem[];
}

interface DirectoryListing {
	path: string;
	items: FileItem[];
	canGoUp: boolean;
	parentPath?: string;
}

/**
 * SyncthingMonitor class using Node.js HTTP module for reliable localhost communication.
 * Based on the proven approach from Diego-Viero/Syncthing-status-icon-Obsidian-plugin.
 */
class SyncthingMonitor extends EventEmitter {
	private token: string | null = null;
	private timeout: number = 1;
	private lastEventId: number | undefined;
	private pollingTimeoutId: NodeJS.Timeout | undefined;
	private isTokenSet: boolean = false;
	private baseUrl: string = 'http://127.0.0.1:8384';
	private isMobileMode: boolean = false;
	private remoteUsername: string = '';
	private remotePassword: string = '';
	
	public status: string = "idle";
	public connectedDevicesCount: number = 0;
	public availableDevices: number = 0;
	public fileCompletion: number | undefined;
	public globalItems: number | undefined;
	public needItems: number | undefined;

	public setStatusIcon: (icon: string) => void = () => {};

	/**
	 * Create authentication headers for mobile/remote requests
	 */
	private createAuthHeaders(): HeadersInit {
		const headers: HeadersInit = {
			'X-API-Key': this.token || '',
		};

		// Add basic authentication if username/password are provided
		if (this.remoteUsername && this.remotePassword) {
			const credentials = btoa(`${this.remoteUsername}:${this.remotePassword}`);
			headers['Authorization'] = `Basic ${credentials}`;
		}

		return headers;
	}

	public startMonitoring(
		settings: Settings, 
		setStatusIcon: (icon: string) => void,
		baseUrl: string,
		isMobileMode: boolean = false
	) {
		this.token = settings.syncthingApiKey;
		this.timeout = 1; // Use 1 second polling for responsiveness
		this.setStatusIcon = setStatusIcon;
		this.isTokenSet = !!settings.syncthingApiKey;
		this.baseUrl = baseUrl;
		this.isMobileMode = isMobileMode;
		this.remoteUsername = settings.remoteUsername;
		this.remotePassword = settings.remotePassword;

		if (this.isTokenSet) {
			if (this.isMobileMode) {
				this.pollMobile();
				this.checkConnectionsMobile();
			} else {
				this.poll();
				this.checkConnections();
			}
		} else {
			this.status = "API key not set";
			this.setStatusIcon('❌');
			this.emit('status-update', {
				status: this.status,
				fileCompletion: NaN,
				globalItems: NaN,
				needItems: NaN,
				connectedDevicesCount: NaN,
				availableDevices: NaN
			});
		}
	}

	public stopMonitoring() {
		if (this.pollingTimeoutId) {
			clearTimeout(this.pollingTimeoutId);
			this.pollingTimeoutId = undefined;
		}
		this.lastEventId = undefined;
		this.status = "stopped";
		this.emit('disconnected');
	}

	private poll() {
		const lastId = this.lastEventId ?? 0;

		if (!this.token) {
			console.error('Syncthing API token is not set. Cannot poll for events.');
			this.status = "API key not set";
			this.emit('status-update', {
				status: this.status,
				fileCompletion: NaN,
				globalItems: NaN,
				needItems: NaN,
				connectedDevicesCount: NaN,
				availableDevices: NaN
			});
			return;
		}

		// Parse URL for hostname and port
		const url = new URL(this.baseUrl);
		
		// Use IPv4 localhost to avoid IPv6 connection issues
		let hostname = url.hostname;
		if (hostname === 'localhost') {
			hostname = '127.0.0.1'; // Use IPv4 instead of IPv6
		}
		
		const options = {
			hostname: hostname,
			port: parseInt(url.port) || 8384,
			path: `/rest/events?since=${lastId}&timeout=${this.timeout}`,
			method: 'GET',
			headers: {
				'X-API-Key': this.token,
			}
		};

		const req = http.request(options, (res) => {
			let body = '';

			res.on('data', chunk => {
				body += chunk;
			});

			res.on('end', () => {
				const csrfErrorRegex = /CSRF Error/i;

				if (res.statusCode === 401 || csrfErrorRegex.test(body)) {
					console.error('Syncthing API key is invalid (401 Unauthorized or CSRF Error).');
					this.status = "Invalid API key";
					this.setStatusIcon('❌');
					this.emit('status-update', {
						status: this.status,
						fileCompletion: NaN,
						globalItems: NaN,
						needItems: NaN,
						connectedDevicesCount: NaN,
						availableDevices: NaN
					});
					this.pollingTimeoutId = setTimeout(() => this.poll(), 5000);
					return;
				}

				try {
					const events = JSON.parse(body);

					if (Array.isArray(events)) {
						for (const event of events) {
							this.lastEventId = Math.max(this.lastEventId ?? 0, event.id);
							this.processEvent(event);
						}
					}
				} catch (err) {
					console.error('Failed to parse Syncthing events or unexpected response:', err);
				} finally {
					this.checkConnections();
					this.emit('status-update', {
						status: this.status,
						fileCompletion: this.fileCompletion,
						globalItems: this.globalItems,
						needItems: this.needItems,
						connectedDevicesCount: this.connectedDevicesCount,
						availableDevices: this.availableDevices
					});
					this.pollingTimeoutId = setTimeout(() => this.poll(), this.timeout * 1000);
				}
			});
		});

		req.on('error', (err) => {
			console.error('Syncthing connection error:', err);
			this.status = "Connection error";
			this.setStatusIcon('❌');
			this.pollingTimeoutId = setTimeout(() => this.poll(), 5000);
		});

		req.end();
	}

	private processEvent(event: SyncthingEvent) {
		console.log('Syncthing event:', event.type, event.data);

		switch (event.type) {
			case 'FolderCompletion':
				const completion = event.data.completion;
				const globalItems = event.data.globalItems;
				const needItems = event.data.needItems;
				
				this.fileCompletion = completion;
				this.globalItems = globalItems;
				this.needItems = needItems;

				if (completion !== 100) {
					this.setStatusIcon('🟡');
				} else {
					this.setStatusIcon('🟢');
				}
				break;

			case 'StateChanged':
				const newStatus = event.data.to; // idle, scanning, scan-waiting
				this.status = newStatus;

				if (newStatus === "scanning") {
					this.setStatusIcon('🟡');
				} else if (newStatus === "idle") {
					this.setStatusIcon('🟢');
				}
				break;

			case 'DeviceDisconnected':
				this.setStatusIcon('🔴');
				this.status = "Device disconnected";
				break;

			case 'DeviceConnected':
				this.setStatusIcon('🟢');
				this.status = "Device connected";
				break;

			default:
				// Handle other events as needed
				break;
		}
	}

	private checkConnections() {
		if (!this.token) {
			console.error('Syncthing API token is not set. Cannot check connections.');
			this.status = "API key not set";
			this.emit('status-update', {
				status: this.status,
				fileCompletion: NaN,
				globalItems: NaN,
				needItems: NaN,
				connectedDevicesCount: NaN,
				availableDevices: NaN
			});
			return;
		}

		// Parse URL for hostname and port
		const url = new URL(this.baseUrl);

		// Use IPv4 localhost to avoid IPv6 connection issues
		let hostname = url.hostname;
		if (hostname === 'localhost') {
			hostname = '127.0.0.1'; // Use IPv4 instead of IPv6
		}

		const options = {
			hostname: hostname,
			port: parseInt(url.port) || 8384,
			path: '/rest/system/connections',
			method: 'GET',
			headers: {
				'X-API-Key': this.token,
			}
		};

		const req = http.request(options, (res) => {
			let body = '';

			res.on('data', chunk => {
				body += chunk;
			});

			res.on('end', () => {
				const csrfErrorRegex = /CSRF Error/i;

				if (res.statusCode === 401 || csrfErrorRegex.test(body)) {
					console.error('Syncthing API key is invalid (401 Unauthorized or CSRF Error).');
					this.status = "Invalid API key";
					return;
				}

				try {
					const data: ConnectionsResponse = JSON.parse(body);
					const connections = data.connections || {};

					// Get our device ID to exclude from count
					// We'll need to make another request to get our device ID
					this.getCurrentDeviceId().then(myDeviceId => {
						// Filter out our own device when counting
						const otherDevices = Object.keys(connections).filter(deviceId => deviceId !== myDeviceId);
						this.availableDevices = otherDevices.length;
						this.connectedDevicesCount = otherDevices.filter(deviceId => connections[deviceId]?.connected).length;

						console.log(`Desktop connections: ${this.connectedDevicesCount}/${this.availableDevices} devices (excluding self: ${myDeviceId})`);

						// Update status based on connections
						if (this.connectedDevicesCount === 0) {
							this.setStatusIcon('🔴');
							this.status = "No devices connected";
						} else if (this.status === "idle") {
							this.setStatusIcon('🟢');
						}

						this.emit('status-update', {
							status: this.status,
							fileCompletion: this.fileCompletion,
							globalItems: this.globalItems,
							needItems: this.needItems,
							connectedDevicesCount: this.connectedDevicesCount,
							availableDevices: this.availableDevices
						});
					}).catch(err => {
						console.error('Failed to get device ID:', err);
						// Fallback to old behavior
						const connectionsArray = Object.values(connections);
						this.availableDevices = connectionsArray.length;
						this.connectedDevicesCount = connectionsArray.filter(conn => conn.connected).length;
					});
				} catch (err) {
					console.error('Failed to parse Syncthing connections or unexpected response:', err);
				}
			});
		});

		req.on('error', (err) => {
			console.error('Syncthing connections API error:', err);
		});

		req.end();
	}

	/**
	 * Get current device ID
	 */
	private async getCurrentDeviceId(): Promise<string> {
		return new Promise((resolve, reject) => {
			const url = new URL(this.baseUrl);
			let hostname = url.hostname;
			if (hostname === 'localhost') {
				hostname = '127.0.0.1';
			}
			
			const options = {
				hostname: hostname,
				port: parseInt(url.port) || 8384,
				path: '/rest/system/status',
				method: 'GET',
				headers: {
					'X-API-Key': this.token,
				}
			};

			const req = http.request(options, (res) => {
				let body = '';
				res.on('data', chunk => { body += chunk; });
				res.on('end', () => {
					try {
						const data = JSON.parse(body);
						resolve(data.myID || '');
					} catch (err) {
						reject(err);
					}
				});
			});

			req.on('error', reject);
			req.end();
		});
	}

	/**
	 * Check if Syncthing is running using Node.js HTTP requests
	 */
	public async isSyncthingRunning(): Promise<boolean> {
		return new Promise((resolve) => {
			// Parse URL for hostname and port
			const url = new URL(this.baseUrl);
			
			// Use IPv4 localhost instead of IPv6 to avoid connection issues
			let hostname = url.hostname;
			if (hostname === 'localhost') {
				hostname = '127.0.0.1'; // Use IPv4 instead of IPv6
			}
			
			const options = {
				hostname: hostname,
				port: parseInt(url.port) || 8384,
				path: '/',
				method: 'GET',
				timeout: 2000, // 2 second timeout
			};

			const req = http.request(options, (res) => {
				// If we get any response, Syncthing is running
				resolve(true);
			});

			req.on('error', (err) => {
				console.log('Syncthing connection error:', err.message);
				// ECONNREFUSED means definitely not running
				if (err.message.includes('ECONNREFUSED')) {
					resolve(false);
				} else {
					// Other errors might mean it's running but auth required
					resolve(false);
				}
			});

			req.on('timeout', () => {
				req.destroy();
				resolve(false);
			});

			req.end();
		});
	}

	/**
	 * Mobile-compatible polling using fetch API
	 */
	private async pollMobile() {
		const lastId = this.lastEventId ?? 0;

		if (!this.token) {
			console.error('Syncthing API token is not set. Cannot poll for events.');
			this.status = "API key not set";
			this.emit('status-update', {
				status: this.status,
				fileCompletion: NaN,
				globalItems: NaN,
				needItems: NaN,
				connectedDevicesCount: NaN,
				availableDevices: NaN
			});
			return;
		}

		try {
			const response = await fetch(`${this.baseUrl}/rest/events?since=${lastId}&timeout=${this.timeout}`, {
				method: 'GET',
				headers: this.createAuthHeaders(),
			});

			if (response.status === 401) {
				console.error('Syncthing API key is invalid (401 Unauthorized).');
				this.status = "Invalid API key";
				this.setStatusIcon('❌');
				this.emit('status-update', {
					status: this.status,
					fileCompletion: NaN,
					globalItems: NaN,
					needItems: NaN,
					connectedDevicesCount: NaN,
					availableDevices: NaN
				});
				setTimeout(() => this.pollMobile(), 5000);
				return;
			}

			if (response.ok) {
				const events = await response.json();

				if (Array.isArray(events)) {
					for (const event of events) {
						this.lastEventId = Math.max(this.lastEventId ?? 0, event.id);
						this.processEvent(event);
					}
				}
			}
		} catch (error) {
			console.error('Mobile Syncthing connection error:', error);
			this.status = "Connection error";
			this.setStatusIcon('❌');
		} finally {
			this.checkConnectionsMobile();
			this.emit('status-update', {
				status: this.status,
				fileCompletion: this.fileCompletion,
				globalItems: this.globalItems,
				needItems: this.needItems,
				connectedDevicesCount: this.connectedDevicesCount,
				availableDevices: this.availableDevices
			});
			setTimeout(() => this.pollMobile(), this.timeout * 1000);
		}
	}

	/**
	 * Mobile-compatible connection checking using fetch API
	 */
	private async checkConnectionsMobile() {
		try {
			// Get system status to get our device ID
			const statusResponse = await fetch(`${this.baseUrl}/rest/system/status`, {
				method: 'GET',
				headers: this.createAuthHeaders(),
			});
			
			let myDeviceId = '';
			if (statusResponse.ok) {
				const statusData = await statusResponse.json();
				myDeviceId = statusData.myID || '';
			}

			const response = await fetch(`${this.baseUrl}/rest/system/connections`, {
				method: 'GET',
				headers: this.createAuthHeaders(),
			});

			if (response.ok) {
				const connectionsData = await response.json() as ConnectionsResponse;
				const connections = connectionsData.connections || {};
				
				// Filter out our own device when counting
				const otherDevices = Object.keys(connections).filter(deviceId => deviceId !== myDeviceId);
				this.connectedDevicesCount = otherDevices.filter(deviceId => connections[deviceId]?.connected).length;
				this.availableDevices = otherDevices.length;
				
				console.log(`Mobile connections: ${this.connectedDevicesCount}/${this.availableDevices} devices (excluding self: ${myDeviceId})`);
			}
		} catch (error) {
			console.error('Error checking mobile connections:', error);
		}
	}

	/**
	 * Mobile-compatible status check using fetch API
	 */
	public async isSyncthingRunningMobile(): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}/rest/system/status`, {
				method: 'GET',
				headers: this.createAuthHeaders(),
				// Add a timeout using AbortController
				signal: AbortSignal.timeout(5000) // 5 second timeout
			});
			
			return response.ok;
		} catch (error) {
			console.log('Mobile Syncthing connection error:', error);
			return false;
		}
	}
}

const UPDATE_INTERVAL = 5000;
const SYNCTHING_CONTAINER_URL = "http://127.0.0.1:8384/";
const SYNCTHING_CORS_PROXY_CONTAINER_URL = "http://127.0.0.1:8380/";

export default class Obsyncth extends Plugin {
	public settings: Settings;

	private vaultPath = "";
	private vaultName = "";
	private isMobile = false;

	private syncthingInstance: any | null = null;
	private syncthingLastSyncDate: string = "no data";
	monitor: SyncthingMonitor;
	iosFileManager: IOSFileManager | null = null;

	private statusBarConnectionIconItem: HTMLElement | null = this.addStatusBarItem();
	private statusBarLastSyncTextItem: HTMLElement | null = this.addStatusBarItem();

	async onload() {
		await this.loadSettings();

		// Initialize monitor
		this.monitor = new SyncthingMonitor();

		// Detect mobile platform
		this.isMobile = this.detectMobilePlatform();
		
		// Auto-enable mobile mode on mobile platforms
		if (this.isMobile && !this.settings.mobileMode) {
			this.settings.mobileMode = true;
			await this.saveSettings();
		}

		// Initialize iOS file manager on mobile platforms
		if (this.isMobile) {
			this.iosFileManager = new IOSFileManager(this.app.vault, {
				selectedVaultPath: this.settings.selectedVaultPath,
				syncedFiles: this.settings.syncedFiles,
				ignorePatterns: this.settings.ignorePatterns,
				allowHiddenFiles: this.settings.allowHiddenFiles,
				manualFileMapping: {}
			});
			
			const initialized = await this.iosFileManager.initialize();
			if (initialized) {
				console.log('iOS File Manager initialized successfully');
			} else {
				console.warn('iOS File Manager initialization failed');
			}
		}

		let adapter = this.app.vault.adapter;
		if (adapter instanceof FileSystemAdapter) {
			this.vaultPath = adapter.getBasePath();
			this.vaultName = adapter.getName();
		}

		this.statusBarConnectionIconItem?.addClasses(['status-bar-item', 'status-icon']);
		this.statusBarConnectionIconItem?.setAttribute('data-tooltip-position', 'top');

		this.statusBarConnectionIconItem?.onClickEvent((event) => {
			this.monitor.isSyncthingRunning().then(isRunning => {
				if (!isRunning) {
					new Notice('Starting Syncthing!');
					this.startSyncthing();
				}
				else {
					new Notice('Stopping Syncthing!');
					this.stopSyncthing();
				}
			}
		)});

		// Start monitoring with new approach
		this.startStatusMonitoring();

		// Update syncthing the status bar item
		this.updateStatusBar();

		// Register tick interval for last sync date updates
		this.registerInterval(
			window.setInterval(() => this.updateLastSyncDate(), UPDATE_INTERVAL)
		);

		// Register settings tab
		this.addSettingTab(new SettingTab(this.app, this));

		// Start syncthing if set in settings
		if (this.settings.startOnObsidianOpen)
		{
			this.startSyncthing();
		}

		// Check for encryption mismatches after initialization
		// Add a delay to ensure Syncthing is ready
		setTimeout(async () => {
			if (this.settings.syncthingApiKey && !this.isMobile && !this.settings.mobileMode) {
				try {
					await this.checkAndFixEncryptionMismatch();
				} catch (error) {
					console.log('Initial encryption check skipped (Syncthing may not be running yet)');
				}
			}
		}, 5000);

		// Register on Obsidian close handler 
		window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));
	}

	onunload() {
		window.removeEventListener('beforeunload', this.handleBeforeUnload.bind(this));
		this.monitor.stopMonitoring();
	}

	// --- Logic ---

	startStatusMonitoring() {
		if (!this.settings.syncthingApiKey) {
			this.setStatusIcon('⚠️');
			console.log('No API key set. Syncthing is running but requires configuration.');
			
			// Still try to monitor basic connectivity for first-run scenarios
			const baseUrl = this.getSyncthingURL();
			const isMobileMode = this.isMobile || this.settings.mobileMode;
			this.monitor.startMonitoring(this.settings, this.setStatusIcon, baseUrl, isMobileMode);
			
			// Show a helpful notice for first-time users
			new Notice('Syncthing is running! Please configure your API key in the plugin settings to enable full functionality.', 8000);
			
			// Auto-open Syncthing GUI for first-time setup if no API key is configured
			setTimeout(() => {
				if (!this.settings.syncthingApiKey) {
					const url = this.getSyncthingURL();
					console.log(`Opening Syncthing GUI for first-time setup: ${url}`);
					// Don't auto-open to avoid being intrusive, just log the URL
				}
			}, 3000);
			return;
		}

		const baseUrl = this.getSyncthingURL();
		const isMobileMode = this.isMobile || this.settings.mobileMode;
		this.monitor.startMonitoring(this.settings, this.setStatusIcon, baseUrl, isMobileMode);

		// Listen for status updates
		this.monitor.on('status-update', (data) => {
			// Update status bar with real-time information
			this.updateStatusBarFromMonitor(data);
		});
	}

	private setStatusIcon = (icon: string) => {
		if (this.statusBarConnectionIconItem) {
			this.statusBarConnectionIconItem.setText(icon);
			
			// Update tooltip based on status
			let tooltip = `Syncthing: ${this.monitor.status}`;
			if (this.monitor.availableDevices > 0) {
				tooltip += `\nDevices: ${this.monitor.connectedDevicesCount}/${this.monitor.availableDevices}`;
			}
			if (this.monitor.fileCompletion !== undefined && !isNaN(this.monitor.fileCompletion)) {
				tooltip += `\nSync: ${this.monitor.fileCompletion.toFixed(1)}%`;
			}
			this.statusBarConnectionIconItem.setAttribute('title', tooltip);
			this.statusBarConnectionIconItem.ariaLabel = tooltip;
		}
	}

	private updateStatusBarFromMonitor(data: any) {
		// Update icon based on status
		if (data.status === "Invalid API key") {
			this.setStatusIcon('❌');
		} else if (data.status === "API key not set") {
			this.setStatusIcon('❌');
		} else if (data.connectedDevicesCount === 0) {
			this.setStatusIcon('🔴');
		} else if (data.status === "scanning") {
			this.setStatusIcon('🟡');
		} else if (data.fileCompletion !== undefined && data.fileCompletion < 100) {
			this.setStatusIcon('🟡');
		} else {
			this.setStatusIcon('🟢');
		}
	}

	handleBeforeUnload(event: any) {
		// Kill syncthing if running and set in settings
		if (this.settings.stopOnObsidianClose)
		{
			this.stopSyncthing();
		}
	}

	async startSyncthing() {
		this.monitor.isSyncthingRunning().then(async isRunning => {
			// Check if already running
			if (isRunning) {
				console.log('Syncthing is already running');
				return;
			}

			// Mobile mode - cannot start Syncthing locally
			if (this.isMobile || this.settings.mobileMode) {
				new Notice('Mobile mode: Please connect to an existing Syncthing instance via Remote URL in settings', 5000);
				return;
			}

			if (this.settings.useDocker) // Docker
			{
				if (this.checkDockerStatus())
				{
					new Notice('Starting Docker');
					this.startSyncthingDockerStack();
				}
			}
			else // Local Obsidian sub-process
			{
				if (!spawn) {
					new Notice('Local Syncthing execution not available on mobile platforms', 5000);
					return;
				}

				// Check if executable exists
				const executableExists = await this.checkExecutableExists();
				if (!executableExists) {
					new Notice('Syncthing executable missing. Attempting to download...', 5000);
					const downloadSuccess = await this.downloadSyncthingExecutable();
					if (!downloadSuccess) {
						new Notice('Auto-download failed. Please manually download syncthing-executables.tar.gz from the GitHub release or enable Mobile Mode.', 15000);
						return;
					}
				}

				const executablePath = this.getSyncthingExecutablePath();
				
				// Ensure the complete directory structure exists
				const pluginPath = this.getPluginAbsolutePath();
				const binaryConfigDir = `${pluginPath}Syncthing binary-config`;
				const configDir = `${binaryConfigDir}/syncthing-config`;
				
				if (typeof require !== 'undefined') {
					const fs = require('fs');
					const path = require('path');
					
					try {
						// First ensure the parent binary-config directory exists
						if (!fs.existsSync(binaryConfigDir)) {
							console.log(`Creating Syncthing binary-config directory: ${binaryConfigDir}`);
							fs.mkdirSync(binaryConfigDir, { recursive: true });
						}
						
						// Then ensure the config subdirectory exists
						if (!fs.existsSync(configDir)) {
							console.log(`Creating syncthing config directory: ${configDir}`);
							fs.mkdirSync(configDir, { recursive: true });
						}
						
						// Verify directory creation was successful
						if (!fs.existsSync(configDir)) {
							throw new Error(`Failed to create config directory: ${configDir}`);
						}
						
						console.log(`Syncthing config directory ready: ${configDir}`);
					} catch (dirError) {
						console.error('Failed to create Syncthing directories:', dirError);
						new Notice(`Failed to create Syncthing directories: ${dirError.message}`, 10000);
						return;
					}
				}
				
				// Extract port from remoteUrl if it's localhost, otherwise use default
				let port = '8384';
				if (this.settings.remoteUrl) {
					const urlMatch = this.settings.remoteUrl.match(/^https?:\/\/(127\.0\.0\.1|localhost):(\d+)/);
					if (urlMatch) {
						port = urlMatch[2];
						console.log(`Using custom port ${port} from remoteUrl: ${this.settings.remoteUrl}`);
					} else {
						console.log(`RemoteUrl set but not localhost, using default port 8384: ${this.settings.remoteUrl}`);
					}
				} else {
					console.log(`No remoteUrl set, using default port 8384`);
				}
				
				// Check if port has changed and clear config if needed
				await this.ensureConfigForPort(configDir, port);
				
				// Stop any existing Syncthing instance before starting with new config
				if (this.syncthingInstance) {
					console.log('Stopping existing Syncthing instance before starting with new configuration...');
					await this.stopSyncthing();
					// Wait a moment for clean shutdown
					await new Promise(resolve => setTimeout(resolve, 1000));
				}
				
				// Give filesystem a moment to ensure directory is ready
				await new Promise(resolve => setTimeout(resolve, 100));
				
				// Start Syncthing with configuration directory
				const args = [
					'--home', configDir,
					'--no-browser',
					'--gui-address', `127.0.0.1:${port}`
				];
				
				console.log(`Starting Syncthing with args: ${args.join(' ')}`);
				console.log(`Using config directory: ${configDir}`);
				
				try {
					this.syncthingInstance = spawn(executablePath, args);
				} catch (spawnError) {
					console.error('Failed to spawn Syncthing process:', spawnError);
					new Notice(`Failed to start Syncthing: ${spawnError.message}. Try re-downloading the executable.`, 10000);
					return;
				}

				this.syncthingInstance.stdout.on('data', (data: any) => {
					const output = data.toString();
					console.log(`stdout: ${output}`);
					
					// Look for web GUI ready indicators in the logs
					if (output.includes('GUI and API listening') || 
						output.includes('Web GUI is available') ||
						output.includes('Web UI is available') ||
						output.includes('Access the GUI via')) {
						console.log('🌐 Syncthing GUI startup detected in logs');
					}
				});

				this.syncthingInstance.stderr.on('data', (data: any) => {
					const errorMsg = data.toString();
					console.error(`stderr: ${errorMsg}`);
					
					// Check for config directory related errors
					if (errorMsg.includes('failed to create config dir') || 
						errorMsg.includes('cannot create directory') || 
						errorMsg.includes('permission denied')) {
						console.error('Syncthing config directory error detected');
						new Notice(`Syncthing config directory error: ${errorMsg.trim()}`, 10000);
					}
					
					// Check for web interface / API errors
					if (errorMsg.includes('panic') || 
						errorMsg.includes('cannot bind') || 
						errorMsg.includes('address already in use') ||
						errorMsg.includes('failed to start web UI')) {
						console.error('Syncthing web interface error detected');
						new Notice(`Syncthing web interface error: ${errorMsg.trim()}`, 10000);
					}
					
					// Check for database/config corruption
					if (errorMsg.includes('database') && errorMsg.includes('corrupt') ||
						errorMsg.includes('config') && errorMsg.includes('invalid')) {
						console.error('Syncthing configuration corruption detected');
						new Notice('Syncthing configuration may be corrupted. Try resetting the configuration in Advanced settings.', 15000);
					}
				});

				this.syncthingInstance.on('exit', (code: any) => {
					console.log(`child process exited with code ${code}`);
				});

				this.syncthingInstance.on('error', (error: any) => {
					console.error('Syncthing process error:', error);
					if (error.code === 'ENOEXEC') {
						new Notice('Syncthing executable cannot be run. This may be due to permission issues or corrupted download. Try re-downloading the executable.', 15000);
					} else {
						new Notice(`Syncthing process error: ${error.message}`, 10000);
					}
				});

				// Start monitoring after allowing Syncthing to fully initialize
				// First run needs more time to create initial config and start web UI
				const startupDelay = fs.existsSync(`${configDir}/config.xml`) ? 3000 : 8000;
				console.log(`Waiting ${startupDelay}ms for Syncthing to initialize...`);
				
				setTimeout(async () => {
					// Wait for Syncthing to be responsive before starting monitoring
					await this.waitForSyncthingStartup(port);
					this.startStatusMonitoring();
				}, startupDelay);
			}
		});
	}

	stopSyncthing(): void {
		// Stop monitoring
		this.monitor.stopMonitoring();

		// Mobile mode or mobile platform - nothing to stop locally
		if (this.isMobile || this.settings.mobileMode) {
			console.log('Mobile mode: No local Syncthing to stop');
			return;
		}

		if (this.settings.useDocker) {
			if (!exec) {
				console.log('Docker operations not available on mobile platforms');
				return;
			}

			const dockerRunCommand = [
				`docker compose`,
				`-f ${this.getPluginAbsolutePath()}docker/docker-compose.yaml`,
				`stop`,
			];

			exec(dockerRunCommand.join(' '), (error: any, stdout: any, stderr: any) => {
				if (error) {
					console.error('Error:', error.message);
					return false;
				}
				if (stderr) {
					console.log(stderr);
					return false;
				}
	
				console.log('Output:', stdout);
			});
		} else {
			// Enhanced process stopping - kill ALL Syncthing processes
			this.killAllSyncthingProcesses();
		}
	}

	/**
	 * Kill all Syncthing processes to prevent orphaned instances
	 */
	private killAllSyncthingProcesses(): void {
		// First try to stop the tracked instance
		if (this.syncthingInstance) {
			const pid: number | undefined = this.syncthingInstance?.pid;
			if (pid !== undefined) {
				var kill = require('tree-kill');
				kill(pid, 'SIGTERM', (err: any) => {
					if (err) {
						console.error('Failed to kill tracked process tree:', err);
					} else {
						console.log('Tracked process tree killed successfully.');
					}
				});
			}
			// Clear the instance reference
			this.syncthingInstance = null;
		}

		// Then try to kill any other Syncthing processes by name
		if (exec) {
			let killCommand: string;
			
			if (platformInfo.platform === 'win32') {
				// Windows: Kill by process name
				killCommand = 'taskkill /F /IM syncthing.exe /T';
			} else {
				// Unix-like: Kill by process name
				killCommand = 'pkill -f syncthing';
			}

			exec(killCommand, (error: any, stdout: any, stderr: any) => {
				if (error) {
					// Not finding processes to kill is not an error
					if (!error.message.includes('not found') && !error.message.includes('No such process')) {
						console.log('Error killing Syncthing processes:', error.message);
					}
				} else {
					console.log('All Syncthing processes terminated');
				}
			});
		}
	}

	/**
	 * Use Node.js HTTP for config operations to match the monitoring approach
	 */
	async pauseSyncthing(): Promise<boolean> {
		try {
			const baseUrl = this.getSyncthingURL();
			const config = await this.getSyncthingConfig();
			
			// Pause all folders
			for (const folder of config.folders) {
				folder.paused = true;
			}
			
			return await this.updateSyncthingConfig(config);
		} catch (error) {
			console.error('Failed to pause Syncthing:', error);
			return false;
		}
	}

	async resumeSyncthing(): Promise<boolean> {
		try {
			const baseUrl = this.getSyncthingURL();
			const config = await this.getSyncthingConfig();
			
			// Resume all folders
			for (const folder of config.folders) {
				folder.paused = false;
			}
			
			return await this.updateSyncthingConfig(config);
		} catch (error) {
			console.error('Failed to resume Syncthing:', error);
			return false;
		}
	}

	/**
	 * Get Syncthing config using Node.js HTTP
	 */
	async getSyncthingConfig(): Promise<any> {
		// Use mobile-compatible method if on mobile or mobile mode
		if (this.isMobile || this.settings.mobileMode) {
			return await this.getSyncthingConfigMobile();
		}

		// Desktop method using Node.js HTTP
		return new Promise((resolve, reject) => {
			if (!this.settings.syncthingApiKey) {
				reject(new Error('API key not set'));
				return;
			}

			const url = new URL(this.getSyncthingURL());
			
			// Use IPv4 localhost instead of IPv6 to avoid connection issues
			let hostname = url.hostname;
			if (hostname === 'localhost') {
				hostname = '127.0.0.1'; // Use IPv4 instead of IPv6
			}
			
			const options = {
				hostname: hostname,
				port: parseInt(url.port) || 8384,
				path: '/rest/config',
				method: 'GET',
				headers: {
					'X-API-Key': this.settings.syncthingApiKey,
				}
			};

			const req = http.request(options, (res) => {
				let body = '';
				res.on('data', chunk => body += chunk);
				res.on('end', () => {
					try {
						resolve(JSON.parse(body));
					} catch (error) {
						reject(error);
					}
				});
			});

			req.on('error', reject);
			req.end();
		});
	}

	/**
	 * Update Syncthing config using appropriate method based on platform
	 */
	async updateSyncthingConfig(config: any): Promise<boolean> {
		// Use mobile-compatible method if on mobile or mobile mode
		if (this.isMobile || this.settings.mobileMode) {
			return await this.updateSyncthingConfigMobile(config);
		}

		// Desktop method using Node.js HTTP
		return new Promise((resolve) => {
			if (!this.settings.syncthingApiKey) {
				resolve(false);
				return;
			}

			const url = new URL(this.getSyncthingURL());
			const postData = JSON.stringify(config);
			
			// Use IPv4 localhost instead of IPv6 to avoid connection issues
			let hostname = url.hostname;
			if (hostname === 'localhost') {
				hostname = '127.0.0.1'; // Use IPv4 instead of IPv6
			}
			
			const options = {
				hostname: hostname,
				port: parseInt(url.port) || 8384,
				path: '/rest/config',
				method: 'POST',
				headers: {
					'X-API-Key': this.settings.syncthingApiKey,
					'Content-Type': 'application/json',
					'Content-Length': Buffer.byteLength(postData)
				}
			};

			const req = http.request(options, (res) => {
				resolve(res.statusCode === 200);
			});

			req.on('error', () => resolve(false));
			req.write(postData);
			req.end();
		});
	}

	async startSyncthingDockerStack() {
		if (!exec) {
			new Notice('Docker operations not available on mobile platforms', 5000);
			return;
		}

		// Set environment variable
		this.updateEnvFile({
			VAULT_PATH: `${this.vaultPath}`,
			SYNCTHING_CONFIG_PATH: `${this.vaultPath}/.obsidian/syncthing_config`,
		});

		// Run Docker container
		const dockerRunCommand = [
			`docker compose`,
			`-f ${this.getPluginAbsolutePath()}docker/docker-compose.yaml`,
			`up`, 
			`-d`
		];

		exec(dockerRunCommand.join(' '), (error: any, stdout: any, stderr: any) => {
			if (error) {
				console.error('Error:', error.message);
				return false;
			}
			if (stderr) {
				console.log(stderr);
				return false;
			}

			console.log('Output:', stdout);
		});
	};

	updateEnvFile(vars: Record<string, string>) {
		// Skip on mobile platforms where fs is not available
		if (!writeFileSync || !readFileSync) {
			console.log('File system operations not available on mobile platform');
			return;
		}

		const filePath = `${this.getPluginAbsolutePath()}docker/.env`;
		let content = readFileSync(filePath, 'utf8');
	  
		Object.entries(vars).forEach(([key, value]) => {
		  const regex = new RegExp(`^${key}=.*`, 'm');
		  content = content.replace(regex, `${key}=${value}`);
		});
	  
		writeFileSync(filePath, content, 'utf8');
	}

	async ensureConfigForPort(configDir: string, port: string): Promise<void> {
		if (typeof require !== 'undefined') {
			const fs = require('fs');
			const path = require('path');
			
			// Check if we have a stored port to compare against
			const portFile = path.join(configDir, '.syncthing-port');
			let storedPort = '';
			
			if (fs.existsSync(portFile)) {
				try {
					storedPort = fs.readFileSync(portFile, 'utf8').trim();
				} catch (error) {
					console.log('Could not read stored port file:', error);
				}
			}
			
			// If port has changed, clear the config directory
			if (storedPort && storedPort !== port) {
				console.log(`Port changed from ${storedPort} to ${port}, clearing Syncthing config...`);
				
				// Clear all config files except the directory itself
				try {
					const files = fs.readdirSync(configDir);
					for (const file of files) {
						const filePath = path.join(configDir, file);
						const stat = fs.statSync(filePath);
						if (stat.isFile()) {
							fs.unlinkSync(filePath);
							console.log(`Removed config file: ${file}`);
						} else if (stat.isDirectory() && file !== '.' && file !== '..') {
							// Remove subdirectories recursively
							fs.rmSync(filePath, { recursive: true, force: true });
							console.log(`Removed config directory: ${file}`);
						}
					}
				} catch (error) {
					console.log('Error clearing config directory:', error);
				}
			}
			
			// Store the current port
			try {
				fs.writeFileSync(portFile, port, 'utf8');
				console.log(`Stored current port: ${port}`);
			} catch (error) {
				console.log('Could not store port file:', error);
			}
		}
	}

	async waitForSyncthingStartup(port: string): Promise<void> {
		const maxAttempts = 30; // 30 attempts = ~30 seconds
		const delayMs = 1000; // 1 second between attempts
		
		console.log('Waiting for Syncthing to become responsive...');
		
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				if (typeof require !== 'undefined') {
					const http = require('http');
					
					const result = await new Promise<boolean>((resolve) => {
						const options = {
							hostname: '127.0.0.1',
							port: port,
							path: '/', // Check root path instead of API endpoint
							method: 'GET',
							timeout: 3000,
							headers: {
								'User-Agent': 'Obsyncth-Plugin'
							}
						};
						
						const req = http.request(options, (res: any) => {
							// If we get any HTTP response (200, 401, 403, etc.), it means the server is running
							// Syncthing GUI typically returns 200 for root path or redirects
							resolve(res.statusCode >= 200 && res.statusCode < 500);
						});
						
						req.on('error', (error: any) => {
							// If it's a connection refused error, server isn't running yet
							if (error.code === 'ECONNREFUSED') {
								resolve(false);
							} else {
								// Other errors might mean server is starting up
								resolve(false);
							}
						});
						
						req.on('timeout', () => {
							req.destroy();
							resolve(false);
						});
						
						req.end();
					});
					
					if (result) {
						console.log(`✅ Syncthing web interface is responsive after ${attempt} attempts`);
						// Give it a moment more to fully initialize
						await new Promise(resolve => setTimeout(resolve, 1000));
						return;
					}
				}
				
				console.log(`Attempt ${attempt}/${maxAttempts}: Syncthing web interface not ready yet...`);
				await new Promise(resolve => setTimeout(resolve, delayMs));
				
			} catch (error) {
				console.log(`Attempt ${attempt}/${maxAttempts}: Error checking Syncthing: ${error}`);
				await new Promise(resolve => setTimeout(resolve, delayMs));
			}
		}
		
		console.warn('⚠️ Syncthing did not become responsive within expected time, proceeding anyway...');
	}

	getSyncthingURL(): string {
		// Mobile mode - always use remote URL
		if (this.isMobile || this.settings.mobileMode) {
			console.log(`Using mobile/remote URL: ${this.settings.remoteUrl}`);
			return this.settings.remoteUrl;
		}
		
		// Desktop mode
		if (this.settings.useDocker) {
			console.log(`Using Docker URL: ${SYNCTHING_CORS_PROXY_CONTAINER_URL}`);
			return SYNCTHING_CORS_PROXY_CONTAINER_URL;
		} else {
			// For desktop mode without Docker:
			// Use remoteUrl if set, otherwise default localhost:8384
			if (this.settings.remoteUrl) {
				console.log(`Using configured remoteUrl: ${this.settings.remoteUrl}`);
				return this.settings.remoteUrl;
			}
			console.log(`Using default localhost URL: http://127.0.0.1:8384`);
			return 'http://127.0.0.1:8384';
		}
	}

	/**
	 * Create authentication headers for mobile/remote requests
	 */
	private createAuthHeaders(): HeadersInit {
		const headers: HeadersInit = {
			'X-API-Key': this.settings.syncthingApiKey,
		};

		// Add basic authentication if username/password are provided
		if (this.settings.remoteUsername && this.settings.remotePassword) {
			const credentials = btoa(`${this.settings.remoteUsername}:${this.settings.remotePassword}`);
			headers['Authorization'] = `Basic ${credentials}`;
		}

		return headers;
	}

	/**
	 * Mobile-compatible Syncthing status check using fetch
	 */
	async isSyncthingRunningMobile(): Promise<boolean> {
		try {
			const url = this.getSyncthingURL();
			const response = await fetch(`${url}/rest/system/status`, {
				method: 'GET',
				headers: this.createAuthHeaders(),
				// Add a timeout using AbortController
				signal: AbortSignal.timeout(5000) // 5 second timeout
			});
			
			return response.ok;
		} catch (error) {
			console.log('Mobile Syncthing connection error:', error);
			return false;
		}
	}

	/**
	 * Mobile-compatible config retrieval using fetch
	 */
	async getSyncthingConfigMobile(): Promise<any> {
		try {
			const url = this.getSyncthingURL();
			const response = await fetch(`${url}/rest/config`, {
				method: 'GET',
				headers: this.createAuthHeaders(),
			});
			
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
			
			return await response.json();
		} catch (error) {
			console.error('Failed to get Syncthing config via mobile API:', error);
			throw error;
		}
	}

	/**
	 * Mobile-compatible config update using fetch
	 */
	async updateSyncthingConfigMobile(config: any): Promise<boolean> {
		try {
			const url = this.getSyncthingURL();
			const response = await fetch(`${url}/rest/config`, {
				method: 'POST',
				headers: {
					...this.createAuthHeaders(),
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(config),
			});
			
			return response.ok;
		} catch (error) {
			console.error('Failed to update Syncthing config via mobile API:', error);
			return false;
		}
	}

	/**
	 * Use the monitor's improved status detection
	 */
	async isSyncthingRunning(): Promise<boolean> {
		// Use mobile-compatible method if on mobile or mobile mode
		if (this.isMobile || this.settings.mobileMode) {
			return await this.isSyncthingRunningMobile();
		}
		// Use desktop method otherwise
		return await this.monitor.isSyncthingRunning();
	}

	checkDockerStatus(): boolean {
		if (!exec) {
			console.log('Docker operations not available on mobile platforms');
			return false;
		}

		exec('docker ps', (error: any, stdout: any, stderr: any) => {
			if (error) {
				console.error('Error:', error.message);
				return false;
			}
			if (stderr) {
				console.error('Error:', stderr);
				return false;
			}

			console.log('Output:', stdout);
		});

		return true;
	}

	/**
	 * Apply encryption settings to a folder configuration
	 */
	applyEncryptionSettings(folderConfig: any, deviceId: string): any {
		if (!folderConfig.devices) {
			folderConfig.devices = [];
		}

		// Find or create device entry for this folder
		let deviceEntry = folderConfig.devices.find((d: any) => d.deviceID === deviceId);
		if (!deviceEntry) {
			deviceEntry = {
				deviceID: deviceId,
				introducedBy: "",
				encryptionPassword: ""
			};
			folderConfig.devices.push(deviceEntry);
		}

		// Apply encryption settings based on user preferences
		if (this.settings.encryptionEnabled && this.settings.encryptionPassword) {
			deviceEntry.encryptionPassword = this.settings.encryptionPassword;
		} else {
			deviceEntry.encryptionPassword = "";
		}

		return folderConfig;
	}

	/**
	 * Get iOS-compatible vault path that works with Files app
	 */
	getIOSCompatibleVaultPath(): string {
		if (!this.isMobile) {
			return this.vaultPath;
		}

		// On iOS, ensure we're using the Files app accessible path
		const vaultPath = this.vaultPath;
		
		// If path contains Obsidian's iOS container path, it should be accessible
		if (vaultPath.includes('Documents/') || vaultPath.includes('iCloud/')) {
			return vaultPath;
		}

		// For other cases, log guidance for user
		console.warn('iOS Vault Path Notice: Ensure your vault is accessible via Files app for Syncthing sync');
		new Notice('For iOS sync: Vault must be accessible via Files app. Consider moving vault to iCloud Drive or On My iPhone/iPad location.', 10000);
		
		return vaultPath;
	}

	/**
	 * Configure Syncthing folder with proper encryption and iOS compatibility
	 */
	async configureFolderForDevice(folderId: string, folderPath: string, deviceId: string): Promise<boolean> {
		try {
			const config = await this.getSyncthingConfig();
			
			// Find or create the folder
			let folder = config.folders.find((f: any) => f.id === folderId);
			if (!folder) {
				// Create new folder configuration
				folder = {
					id: folderId,
					label: folderId,
					path: this.isMobile ? this.getIOSCompatibleVaultPath() : folderPath,
					type: "sendreceive",
					devices: [],
					rescanIntervalS: 3600,
					fsWatcherEnabled: true,
					ignorePerms: false,
					autoNormalize: true,
					paused: false
				};
				config.folders.push(folder);
			}

			// Apply encryption settings
			folder = this.applyEncryptionSettings(folder, deviceId);

			// For iOS, add specific configurations
			if (this.isMobile && this.settings.allowHiddenFiles) {
				// Configure Syncthing to handle hidden files properly on iOS
				if (!folder.ignorePatterns) {
					folder.ignorePatterns = [];
				}
				
				// Remove default hidden file ignores if user wants to sync them
				folder.ignorePatterns = folder.ignorePatterns.filter((pattern: string) => 
					!pattern.startsWith('.*') && !pattern.includes('/.*')
				);
				
				console.log('iOS: Configured folder to sync hidden files for better compatibility');
			}

			// Update the configuration
			return await this.updateSyncthingConfig(config);
		} catch (error) {
			console.error('Failed to configure folder for device:', error);
			return false;
		}
	}

	/**
	 * iOS Native Folder Picker - Working Copy style implementation
	 */
	/**
	 * Get file/folder listing for built-in file manager
	 */
	async getDirectoryListing(currentPath: string = ''): Promise<DirectoryListing> {
		try {
			// On iOS/mobile, use the iOS file manager
			if ((this.isMobile || this.settings.mobileMode) && this.iosFileManager) {
				const listing = await this.iosFileManager.getDirectoryListing(currentPath);
				// Convert IOSDirectoryListing to DirectoryListing format
				return {
					path: listing.path,
					items: listing.items.map(item => ({
						name: item.name,
						path: item.path,
						type: item.type,
						isHidden: item.isHidden,
						isSelected: item.isSelected
					})),
					canGoUp: listing.canGoUp,
					parentPath: listing.canGoUp && currentPath ? (currentPath.lastIndexOf('/') > 0 ? currentPath.substring(0, currentPath.lastIndexOf('/')) : '') : undefined
				};
			}
			
			// Desktop implementation using Node.js fs
			if (typeof require !== 'undefined') {
				return this.getDesktopDirectoryListing(currentPath);
			}
			
			// Fallback
			return {
				path: currentPath,
				items: [],
				canGoUp: false
			};
		} catch (error) {
			console.error('Error getting directory listing:', error);
			return {
				path: currentPath,
				items: [],
				canGoUp: false
			};
		}
	}

	/**
	 * iOS directory listing from processed files
	 */
	/**
	 * Desktop directory listing using Node.js fs
	 */
	private getDesktopDirectoryListing(currentPath: string): DirectoryListing {
		if (typeof require === 'undefined') {
			return { path: currentPath, items: [], canGoUp: false };
		}
		
		try {
			const fs = require('fs');
			const path = require('path');
			const basePath = this.settings.selectedVaultPath || this.vaultPath;
			const fullPath = currentPath ? path.join(basePath, currentPath) : basePath;
			
			const entries = fs.readdirSync(fullPath, { withFileTypes: true });
			const items: FileItem[] = [];
			
			for (const entry of entries) {
				const itemPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
				const isHidden = entry.name.startsWith('.');
				
				// Skip hidden files if not allowed and not explicitly in synced files
				if (!this.settings.allowHiddenFiles && isHidden && !this.settings.syncedFiles[itemPath]) {
					continue;
				}
				
				const fullItemPath = path.join(fullPath, entry.name);
				let size: number | undefined = undefined;
				
				if (entry.isFile()) {
					try {
						const stats = fs.statSync(fullItemPath);
						size = stats.size;
					} catch (e) {
						// File might be inaccessible, skip size
					}
				}
				
				items.push({
					name: entry.name,
					path: itemPath,
					type: entry.isDirectory() ? 'folder' : 'file',
					size: size,
					isHidden: isHidden,
					isSelected: this.settings.syncedFiles[itemPath] || false,
					children: entry.isDirectory() ? [] : undefined
				});
			}
			
			// Sort items: folders first, then files
			items.sort((a, b) => {
				if (a.type !== b.type) {
					return a.type === 'folder' ? -1 : 1;
				}
				return a.name.localeCompare(b.name);
			});
			
			return {
				path: currentPath,
				items: items,
				canGoUp: currentPath !== '',
				parentPath: currentPath ? path.dirname(currentPath).replace(/\\/g, '/') : undefined
			};
		} catch (error) {
			console.error('Error reading desktop directory:', error);
			return { path: currentPath, items: [], canGoUp: false };
		}
	}

	/**
	 * Toggle file/folder selection in file manager
	 */
	async toggleFileSelection(filePath: string, selected: boolean): Promise<void> {
		// Use iOS file manager on mobile platforms
		if ((this.isMobile || this.settings.mobileMode) && this.iosFileManager) {
			await this.iosFileManager.toggleFileSelection(filePath, selected);
			// Sync the settings with iOS file manager
			this.settings.syncedFiles = this.iosFileManager.getSyncedFiles();
		} else {
			// Desktop implementation
			this.settings.syncedFiles[filePath] = selected;
			
			// If selecting a folder, optionally select all children
			if (selected) {
				Object.keys(this.settings.syncedFiles).forEach(path => {
					if (path.startsWith(filePath + '/')) {
						this.settings.syncedFiles[path] = true;
					}
				});
			} else {
				// If deselecting a folder, deselect all children
				Object.keys(this.settings.syncedFiles).forEach(path => {
					if (path.startsWith(filePath + '/')) {
						this.settings.syncedFiles[path] = false;
					}
				});
			}
		}
		
		await this.saveSettings();
		
		// Generate and apply ignore patterns
		this.updateIgnorePatterns();
		await this.applySyncthingIgnorePatterns();
	}

	/**
	 * Generate Syncthing ignore patterns from selected files
	 */
	updateIgnorePatterns(): void {
		const ignorePatterns: string[] = [];
		
		// Process all known files/folders
		Object.keys(this.settings.syncedFiles).forEach(filePath => {
			const isSelected = this.settings.syncedFiles[filePath];
			
			if (!isSelected) {
				// Add to ignore patterns - convert to Syncthing format
				if (filePath.endsWith('/') || !filePath.includes('.')) {
					// It's a folder - ignore it and all contents
					ignorePatterns.push(filePath.replace(/\/$/, '') + '/**');
					ignorePatterns.push(filePath.replace(/\/$/, ''));
				} else {
					// It's a file
					ignorePatterns.push(filePath);
				}
			}
		});
		
		// Always ignore plugin files
		ignorePatterns.push('Syncthing binary-config/**');
		ignorePatterns.push('obsyncth/**');
		
		this.settings.ignorePatterns = ignorePatterns;
		console.log(`Generated ${ignorePatterns.length} ignore patterns for Syncthing`);
	}

	/**
	 * Apply ignore patterns to Syncthing configuration
	 */
	async applySyncthingIgnorePatterns(): Promise<boolean> {
		try {
			const config = await this.getSyncthingConfig();
			
			// Find the vault folder - use the first folder if no specific ID is set
			let vaultFolder;
			if (this.settings.vaultFolderID) {
				vaultFolder = config.folders.find((f: any) => f.id === this.settings.vaultFolderID);
			} else {
				// Find folder that contains our vault path or use the first folder
				vaultFolder = config.folders.find((f: any) => {
					return f.path && (
						f.path.includes(this.vaultName) ||
						f.path.endsWith('vault') ||
						f.path.includes('obsidian')
					);
				}) || config.folders[0];
			}
			
			if (!vaultFolder) {
				new Notice('No Syncthing folder found to apply ignore patterns', 5000);
				return false;
			}
			
			// Update ignore patterns
			vaultFolder.ignorePatterns = this.settings.ignorePatterns;
			
			// Update the configuration
			const success = await this.updateSyncthingConfig(config);
			if (success) {
				new Notice(`Applied ${this.settings.ignorePatterns.length} ignore patterns to folder "${vaultFolder.id}"`, 3000);
			} else {
				new Notice('Failed to apply ignore patterns to Syncthing', 5000);
			}
			
			return success;
		} catch (error) {
			console.error('Failed to apply ignore patterns:', error);
			new Notice(`Failed to apply ignore patterns: ${error.message}`, 5000);
			return false;
		}
	}

	/**
	 * Check and fix encryption mismatches across devices
	 */
	async checkAndFixEncryptionMismatch(): Promise<boolean> {
		try {
			const config = await this.getSyncthingConfig();
			let hasChanges = false;
			
			// Check each folder for encryption consistency
			for (const folder of config.folders) {
				const encryptionStates = new Set();
				
				// Check encryption state for each device in this folder
				for (const device of folder.devices || []) {
					const hasEncryption = device.encryptionPassword && device.encryptionPassword.length > 0;
					encryptionStates.add(hasEncryption);
				}
				
				// If we have mixed encryption states, this is likely the cause of the error
				if (encryptionStates.size > 1) {
					console.warn(`Encryption mismatch detected in folder ${folder.id}`);
					new Notice(`Encryption mismatch detected in folder "${folder.id}". Synchronizing encryption settings...`, 8000);
					
					// Fix by applying current settings to all devices
					for (const device of folder.devices || []) {
						if (this.settings.encryptionEnabled && this.settings.encryptionPassword) {
							device.encryptionPassword = this.settings.encryptionPassword;
						} else {
							device.encryptionPassword = "";
						}
					}
					hasChanges = true;
				}
			}

			// Also check and fix the defaults section to prevent future mismatches
			if (config.defaults && config.defaults.folder) {
				const defaultFolder = config.defaults.folder;
				if (defaultFolder.device && defaultFolder.device.encryptionPassword !== undefined) {
					if (this.settings.encryptionEnabled && this.settings.encryptionPassword) {
						if (defaultFolder.device.encryptionPassword !== this.settings.encryptionPassword) {
							defaultFolder.device.encryptionPassword = this.settings.encryptionPassword;
							hasChanges = true;
						}
					} else {
						if (defaultFolder.device.encryptionPassword !== "") {
							defaultFolder.device.encryptionPassword = "";
							hasChanges = true;
						}
					}
				}
			}
			
			// Update configuration if changes were made
			if (hasChanges) {
				console.log('Applying encryption configuration fixes...');
				const updateSuccess = await this.updateSyncthingConfig(config);
				if (updateSuccess) {
					new Notice('✅ Encryption settings synchronized successfully', 5000);
				}
				return updateSuccess;
			} else {
				console.log('No encryption mismatches found');
				return true;
			}
		} catch (error) {
			console.error('Failed to check encryption mismatch:', error);
			return false;
		}
	}

	/**
	 * Remove hardcoded encryption from configuration
	 */
	async removeHardcodedEncryption(): Promise<boolean> {
		try {
			const config = await this.getSyncthingConfig();
			let hasChanges = false;

			// Remove encryption from all folders if user has disabled it
			if (!this.settings.encryptionEnabled) {
				for (const folder of config.folders) {
					for (const device of folder.devices || []) {
						if (device.encryptionPassword && device.encryptionPassword.length > 0) {
							device.encryptionPassword = "";
							hasChanges = true;
						}
					}
				}

				// Also clear defaults
				if (config.defaults && config.defaults.folder && config.defaults.folder.device) {
					if (config.defaults.folder.device.encryptionPassword) {
						config.defaults.folder.device.encryptionPassword = "";
						hasChanges = true;
					}
				}

				if (hasChanges) {
					console.log('Removing hardcoded encryption settings...');
					return await this.updateSyncthingConfig(config);
				}
			}

			return true;
		} catch (error) {
			console.error('Failed to remove hardcoded encryption:', error);
			return false;
		}
	}

	updateStatusBar(): void {
		this.monitor.isSyncthingRunning().then(isRunning => {
			// Display status icon in status bar
			if (this.statusBarConnectionIconItem) {
				if (!isRunning) {
					this.statusBarConnectionIconItem.setText("⚫");
					this.statusBarConnectionIconItem.ariaLabel = "Click to start Syncthing";
				}
				// If running, the monitor will update the icon via setStatusIcon
				
				this.statusBarConnectionIconItem.addClasses(['plugin-editor-status', 'mouse-pointer']);
			}
		});
	}

	/**
	 * Update last sync date - called periodically
	 */
	updateLastSyncDate(): void {
		this.getLastSyncDate().then(lastSyncDate => {
			if (lastSyncDate !== null) {
				const optionsDate: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: '2-digit' };
				const formattedDate = lastSyncDate.toLocaleDateString('en-GB', optionsDate).split( '/' ).join( '.' );

				const optionsTime: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
				const formattedTime = lastSyncDate.toLocaleTimeString('en-GB', optionsTime); 

				this.syncthingLastSyncDate = `${formattedDate} ${formattedTime}`;
			} else {
				this.syncthingLastSyncDate = "no data";
			}

			if (this.statusBarLastSyncTextItem) {
				this.statusBarLastSyncTextItem.setText(`Last sync: ${this.syncthingLastSyncDate}`);
			}
		});
	}

	async checkExecutableExists(): Promise<boolean> {
		if (!this.app.vault.adapter || this.isMobile || this.settings.mobileMode) {
			return true; // Not needed on mobile
		}

		try {
			const executablePath = this.getSyncthingExecutablePath();
			
			// Check if file exists using Node.js fs for desktop
			if (typeof require !== 'undefined') {
				try {
					const fs = require('fs');
					
					// Check if file exists
					if (!fs.existsSync(executablePath)) {
						console.log('Executable file does not exist:', executablePath);
						return false;
					}
					
					// Check if file is executable
					try {
						fs.accessSync(executablePath, fs.constants.F_OK | fs.constants.X_OK);
						console.log('✅ Executable exists and is executable:', executablePath);
						return true;
					} catch (permError) {
						console.log('❌ Executable exists but is not executable:', executablePath, permError.message);
						
						// Try to fix permissions if it's a permission issue
						if (platformInfo.platform !== 'win32') {
							try {
								fs.chmodSync(executablePath, '755');
								console.log('Fixed executable permissions');
								
								// Try again after fixing permissions
								fs.accessSync(executablePath, fs.constants.F_OK | fs.constants.X_OK);
								console.log('✅ Executable permissions fixed');
								return true;
							} catch (fixError) {
								console.log('❌ Could not fix executable permissions:', fixError.message);
								return false;
							}
						}
						return false;
					}
				} catch (error) {
					console.error('Error checking file with fs:', error);
				}
			}
			
			return false;
		} catch (error) {
			console.error('Error checking executable:', error);
			return false;
		}
	}

	/**
	 * Download Syncthing executable using official GitHub releases API
	 */
	async downloadSyncthingExecutable(): Promise<boolean> {
		try {
			new Notice('Fetching latest Syncthing release information...', 5000);
			
			// First, get the latest release information from GitHub API
			const releaseInfo = await this.getLatestSyncthingRelease();
			if (!releaseInfo) {
				new Notice('Failed to fetch latest Syncthing release information', 8000);
				return false;
			}

			// Determine platform and architecture
			let platformPattern: string;
			let expectedExecutableName: string;
			
			console.log(`Detected platform: ${platformInfo.platform}, architecture: ${platformInfo.arch}`);
			
			if (platformInfo.platform === 'win32') {
				// Windows - prefer amd64, fall back to 386 if needed
				const arch = platformInfo.arch === 'x64' ? 'amd64' : platformInfo.arch === 'arm64' ? 'arm64' : '386';
				platformPattern = `syncthing-windows-${arch}-v${releaseInfo.version}`;
				expectedExecutableName = 'syncthing.exe';
			} else if (platformInfo.platform === 'darwin') {
				// macOS - be more specific about architecture selection
				let arch: string;
				if (platformInfo.arch === 'arm64') {
					arch = 'arm64';
				} else if (platformInfo.arch === 'x64') {
					arch = 'amd64';
				} else {
					// For unknown architectures, try universal first
					console.log(`Unknown macOS architecture ${platformInfo.arch}, trying universal build`);
					arch = 'universal';
				}
				platformPattern = `syncthing-macos-${arch}-v${releaseInfo.version}`;
				expectedExecutableName = 'syncthing';
				console.log(`Selected macOS pattern: ${platformPattern}`);
			} else {
				// Linux and other Unix-like systems
				const arch = platformInfo.arch === 'x64' ? 'amd64' : platformInfo.arch === 'arm64' ? 'arm64' : platformInfo.arch === 'arm' ? 'arm' : '386';
				platformPattern = `syncthing-linux-${arch}-v${releaseInfo.version}`;
				expectedExecutableName = 'syncthing';
			}

			console.log(`Looking for release asset matching: ${platformPattern}`);
			console.log(`Available assets: ${releaseInfo.assets.map((a: any) => a.name).join(', ')}`);

			// Find the matching asset
			const asset = releaseInfo.assets.find((asset: any) => 
				asset.name.startsWith(platformPattern)
			);

			if (!asset) {
				// For macOS, try fallback strategies
				if (platformInfo.platform === 'darwin') {
					console.log('Primary macOS asset not found, trying fallbacks...');
					
					// Try universal build
					const universalPattern = `syncthing-macos-universal-v${releaseInfo.version}`;
					const universalAsset = releaseInfo.assets.find((asset: any) => 
						asset.name.startsWith(universalPattern)
					);
					
					if (universalAsset) {
						console.log(`Found universal macOS build: ${universalAsset.name}`);
						new Notice(`Using universal macOS build for ${platformInfo.arch} architecture`, 5000);
						return this.downloadAndInstallAsset(universalAsset, expectedExecutableName);
					}
					
					// Try amd64 as final fallback for x64 systems
					if (platformInfo.arch === 'x64') {
						const amd64Pattern = `syncthing-macos-amd64-v${releaseInfo.version}`;
						const amd64Asset = releaseInfo.assets.find((asset: any) => 
							asset.name.startsWith(amd64Pattern)
						);
						
						if (amd64Asset) {
							console.log(`Found amd64 macOS build: ${amd64Asset.name}`);
							new Notice(`Using amd64 macOS build for x64 architecture`, 5000);
							return this.downloadAndInstallAsset(amd64Asset, expectedExecutableName);
						}
					}
				}

				new Notice(`No Syncthing release found for ${platformInfo.platform} ${platformInfo.arch}. Available assets: ${releaseInfo.assets.map((a: any) => a.name).join(', ')}`, 10000);
				return false;
			}

			return this.downloadAndInstallAsset(asset, expectedExecutableName);

		} catch (error) {
			console.error('Failed to download Syncthing executable:', error);
			new Notice(`Failed to download Syncthing executable: ${error.message}. Please download manually from GitHub release.`, 10000);
			return false;
		}
	}

	/**
	 * Download and install a specific asset
	 */
	private async downloadAndInstallAsset(asset: any, expectedExecutableName: string): Promise<boolean> {
		try {
			new Notice(`Downloading Syncthing ${asset.name.match(/v(\d+\.\d+\.\d+)/)?.[1] || 'latest'} for ${platformInfo.platform} ${platformInfo.arch}... Please wait.`, 8000);
			console.log(`Downloading Syncthing from: ${asset.browser_download_url}`);

			// Download the archive
			const archiveData = await this.downloadFile(asset.browser_download_url);
			if (!archiveData) {
				new Notice('Failed to download Syncthing archive', 8000);
				return false;
			}

			// Extract and install the executable
			const success = await this.extractAndInstallSyncthing(archiveData, asset.name, expectedExecutableName);
			if (success) {
				const version = asset.name.match(/v(\d+\.\d+\.\d+)/)?.[1] || 'latest';
				new Notice(`Syncthing ${version} downloaded and installed successfully!`, 5000);
				return true;
			} else {
				new Notice('Failed to extract and install Syncthing executable', 8000);
				return false;
			}
		} catch (error) {
			console.error('Failed to download and install asset:', error);
			new Notice(`Failed to download and install: ${error.message}`, 8000);
			return false;
		}
	}

	/**
	 * Get latest release information from Syncthing GitHub API
	 */
	private async getLatestSyncthingRelease(): Promise<any> {
		return new Promise((resolve, reject) => {
			const https = require('https');
			
			const options = {
				hostname: 'api.github.com',
				port: 443,
				path: '/repos/syncthing/syncthing/releases/latest',
				method: 'GET',
				headers: {
					'User-Agent': 'Obsyncth-Plugin'
				}
			};

			const req = https.request(options, (res: any) => {
				let data = '';
				
				res.on('data', (chunk: any) => {
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

			req.on('error', (error: any) => {
				reject(new Error(`Failed to fetch release info: ${error.message}`));
			});

			req.setTimeout(10000, () => {
				req.destroy();
				reject(new Error('GitHub API request timeout'));
			});

			req.end();
		});
	}

	/**
	 * Download a file using Node.js HTTPS
	 */
	private async downloadFile(url: string): Promise<Buffer | null> {
		return new Promise((resolve) => {
			const https = require('https');
			const urlModule = require('url');
			
			const parsedUrl = urlModule.parse(url);
			
			const options = {
				hostname: parsedUrl.hostname,
				port: 443,
				path: parsedUrl.path,
				method: 'GET',
				headers: {
					'User-Agent': 'Obsyncth-Plugin'
				}
			};

			const req = https.request(options, (res: any) => {
				if (res.statusCode === 302 || res.statusCode === 301) {
					// Follow redirect
					this.downloadFile(res.headers.location).then(resolve);
					return;
				}
				
				if (res.statusCode !== 200) {
					console.error(`Download failed with status ${res.statusCode}`);
					resolve(null);
					return;
				}

				const chunks: any[] = [];
				res.on('data', (chunk: any) => chunks.push(chunk));
				
				res.on('end', () => {
					resolve(Buffer.concat(chunks));
				});
			});

			req.on('error', (error: any) => {
				console.error('Download failed:', error);
				resolve(null);
			});

			req.setTimeout(60000, () => { // 60 second timeout for large files
				req.destroy();
				console.error('Download timeout');
				resolve(null);
			});

			req.end();
		});
	}

	/**
	 * Extract and install Syncthing executable from downloaded archive
	 */
	private async extractAndInstallSyncthing(archiveData: Buffer, archiveName: string, executableName: string): Promise<boolean> {
		if (typeof require === 'undefined') {
			console.error('File system operations not available');
			return false;
		}

		try {
			const fs = require('fs');
			const path = require('path');
			
			// Create the correct binary directory that matches getSyncthingExecutablePath()
			const syncthingDir = path.join(this.getPluginAbsolutePath(), 'Syncthing binary-config');
			if (!fs.existsSync(syncthingDir)) {
				fs.mkdirSync(syncthingDir, { recursive: true });
			}

			// Determine if it's a zip or tar.gz file
			const isZip = archiveName.endsWith('.zip');
			const isTarGz = archiveName.endsWith('.tar.gz');

			if (isZip) {
				// Handle ZIP files (Windows, macOS)
				const yauzl = await this.extractZip(archiveData, syncthingDir, executableName);
				return yauzl;
			} else if (isTarGz) {
				// Handle TAR.GZ files (Linux)
				return await this.extractTarGz(archiveData, syncthingDir, executableName);
			} else {
				console.error('Unsupported archive format:', archiveName);
				return false;
			}

		} catch (error) {
			console.error('Failed to extract archive:', error);
			return false;
		}
	}

	/**
	 * Extract ZIP archive (for Windows and macOS)
	 */
	private async extractZip(zipData: Buffer, targetDir: string, executableName: string): Promise<boolean> {
		try {
			// For now, let's use a simple approach - save the archive and use system extraction
			const fs = require('fs');
			const path = require('path');
			const { spawn } = require('child_process');
			
			const tempZipPath = path.join(targetDir, 'temp-syncthing.zip');
			fs.writeFileSync(tempZipPath, zipData);
			console.log(`Saved ZIP archive to: ${tempZipPath} (${zipData.length} bytes)`);

			// Try to extract using system unzip command
			return new Promise((resolve) => {
				let extractCommand: string;
				let extractArgs: string[];

				if (platformInfo.platform === 'win32') {
					// Windows - try PowerShell Expand-Archive
					extractCommand = 'powershell';
					extractArgs = ['-Command', `Expand-Archive -Path "${tempZipPath}" -DestinationPath "${targetDir}" -Force`];
				} else {
					// macOS/Linux - use unzip
					extractCommand = 'unzip';
					extractArgs = ['-o', tempZipPath, '-d', targetDir];
				}

				console.log(`Extracting with command: ${extractCommand} ${extractArgs.join(' ')}`);
				const extractProcess = spawn(extractCommand, extractArgs);
				
				let stdout = '';
				let stderr = '';
				
				extractProcess.stdout?.on('data', (data: any) => {
					stdout += data.toString();
				});
				
				extractProcess.stderr?.on('data', (data: any) => {
					stderr += data.toString();
				});
				
				extractProcess.on('close', (code: number) => {
					console.log(`Extraction completed with code: ${code}`);
					if (stdout) console.log(`Extraction stdout: ${stdout}`);
					if (stderr) console.log(`Extraction stderr: ${stderr}`);
					
					try {
						// Clean up temp file
						if (fs.existsSync(tempZipPath)) {
							fs.unlinkSync(tempZipPath);
							console.log('Cleaned up temporary ZIP file');
						}

						if (code === 0) {
							// List contents of target directory for debugging
							try {
								const contents = fs.readdirSync(targetDir);
								console.log(`Contents of ${targetDir}: ${contents.join(', ')}`);
							} catch (listError) {
								console.log('Could not list directory contents:', listError);
							}
							
							// Find the extracted executable
							this.findAndCopyExecutable(targetDir, executableName).then(resolve);
						} else {
							console.error('Extraction failed with code:', code);
							resolve(false);
						}
					} catch (error) {
						console.error('Post-extraction error:', error);
						resolve(false);
					}
				});

				extractProcess.on('error', (error: any) => {
					console.error('Extraction command failed:', error);
					// Clean up temp file
					try {
						if (fs.existsSync(tempZipPath)) {
							fs.unlinkSync(tempZipPath);
						}
					} catch {}
					resolve(false);
				});
			});

		} catch (error) {
			console.error('ZIP extraction error:', error);
			return false;
		}
	}

	/**
	 * Extract TAR.GZ archive (for Linux)
	 */
	private async extractTarGz(tarData: Buffer, targetDir: string, executableName: string): Promise<boolean> {
		try {
			const fs = require('fs');
			const path = require('path');
			const { spawn } = require('child_process');
			
			const tempTarPath = path.join(targetDir, 'temp-syncthing.tar.gz');
			fs.writeFileSync(tempTarPath, tarData);

			// Extract using tar command
			return new Promise((resolve) => {
				const extractProcess = spawn('tar', ['-xzf', tempTarPath, '-C', targetDir]);
				
				extractProcess.on('close', (code: number) => {
					try {
						// Clean up temp file
						if (fs.existsSync(tempTarPath)) {
							fs.unlinkSync(tempTarPath);
						}

						if (code === 0) {
							// Find the extracted executable
							this.findAndCopyExecutable(targetDir, executableName).then(resolve);
						} else {
							console.error('TAR extraction failed with code:', code);
							resolve(false);
						}
					} catch (error) {
						console.error('Post-extraction error:', error);
						resolve(false);
					}
				});

				extractProcess.on('error', (error: any) => {
					console.error('TAR extraction command failed:', error);
					// Clean up temp file
					try {
						if (fs.existsSync(tempTarPath)) {
							fs.unlinkSync(tempTarPath);
						}
					} catch {}
					resolve(false);
				});
			});

		} catch (error) {
			console.error('TAR.GZ extraction error:', error);
			return false;
		}
	}

	/**
	 * Find and copy the Syncthing executable to the final location
	 */
	private async findAndCopyExecutable(extractDir: string, executableName: string): Promise<boolean> {
		try {
			const fs = require('fs');
			const path = require('path');
			const { exec } = require('child_process');

			console.log(`Looking for executable "${executableName}" in: ${extractDir}`);

			// Recursively search for the executable with priority for root-level files
			const findExecutable = (dir: string): string | null => {
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

			const executablePath = findExecutable(extractDir);
			if (!executablePath) {
				console.error(`❌ Executable ${executableName} not found in extracted archive`);
				return false;
			}

			// Additional validation - verify it's actually a proper binary
			const execStats = fs.statSync(executablePath);
			const execSizeInMB = (execStats.size / 1024 / 1024).toFixed(1);
			console.log(`Selected executable: ${executablePath} (${execStats.size} bytes = ${execSizeInMB} MB)`);
			
			if (execStats.size < 1024 * 1024) { // Less than 1MB
				console.error(`❌ Selected file is too small to be a Syncthing binary (${execStats.size} bytes). This is likely a config file, not the executable.`);
				return false;
			}

			// On macOS, check if it's a Mach-O binary
			if (platformInfo.platform === 'darwin') {
				try {
					const fileTypeCheck = await new Promise<string>((resolve) => {
						exec(`file "${executablePath}"`, (error: any, stdout: any) => {
							resolve(stdout || 'Could not determine file type');
						});
					});
					console.log(`Pre-copy file type check: ${fileTypeCheck.trim()}`);
					
					if (fileTypeCheck.includes('ASCII text') || fileTypeCheck.includes('text')) {
						console.error(`❌ Selected file is a text file, not a binary: ${fileTypeCheck.trim()}`);
						return false;
					}
				} catch (typeError) {
					console.log('Could not verify file type (non-fatal):', typeError);
				}
			}

			// Copy to final location based on platform
			let finalPath: string;
			if (platformInfo.platform === 'win32') {
				finalPath = path.join(extractDir, 'syncthing.exe');
			} else if (platformInfo.platform === 'darwin') {
				finalPath = path.join(extractDir, 'syncthing-macos');
			} else {
				finalPath = path.join(extractDir, 'syncthing-linux');
			}

			console.log(`Copying executable from ${executablePath} to ${finalPath}`);

			// Copy the executable
			fs.copyFileSync(executablePath, finalPath);
			console.log(`✅ Executable copied successfully`);
			
			// Make executable on Unix systems and handle macOS security
			if (platformInfo.platform !== 'win32') {
				fs.chmodSync(finalPath, '755');
				console.log('✅ Set executable permissions (755)');
				
				// On macOS, remove quarantine attributes to allow execution
				if (platformInfo.platform === 'darwin') {
					try {
						await new Promise<void>((resolve, reject) => {
							exec(`xattr -d com.apple.quarantine "${finalPath}"`, (error: any) => {
								// Don't reject if the attribute doesn't exist
								if (error && !error.message.includes('No such xattr')) {
									console.log('Note: Could not remove quarantine attribute:', error.message);
								} else {
									console.log('✅ Removed macOS quarantine attribute from executable');
								}
								resolve();
							});
						});
					} catch (error) {
						console.log('Note: Could not remove quarantine attribute (non-fatal):', error);
					}
					
					// Additional debugging for macOS
					try {
						const fileTypeOutput = await new Promise<string>((resolve) => {
							exec(`file "${finalPath}"`, (error: any, stdout: any) => {
								resolve(stdout || 'Could not determine file type');
							});
						});
						console.log(`File type check: ${fileTypeOutput.trim()}`);
						
						const archOutput = await new Promise<string>((resolve) => {
							exec(`lipo -info "${finalPath}" 2>/dev/null || otool -hv "${finalPath}" 2>/dev/null || echo "Not a Mach-O binary"`, (error: any, stdout: any) => {
								resolve(stdout || 'Could not determine architecture');
							});
						});
						console.log(`Architecture check: ${archOutput.trim()}`);
					} catch (debugError) {
						console.log('Debug checks failed (non-fatal):', debugError);
					}
				}
			}

			// Clean up extracted directory structure, keep only our renamed executable
			this.cleanupExtractedFiles(extractDir, path.basename(finalPath));

			console.log(`Syncthing executable installed to: ${finalPath}`);
			
			// Verify the executable is actually executable
			try {
				const stats = fs.statSync(finalPath);
				const mode = stats.mode;
				console.log(`Executable permissions: ${(mode & parseInt('777', 8)).toString(8)}`);
				console.log(`File size: ${stats.size} bytes`);
				
				// Test if we can access the file for execution
				fs.accessSync(finalPath, fs.constants.F_OK | fs.constants.X_OK);
				console.log('✅ Executable permissions verified');
				
				// Try a quick execution test on macOS to see if it actually works
				if (platformInfo.platform === 'darwin') {
					try {
						const testOutput = await new Promise<string>((resolve, reject) => {
							exec(`"${finalPath}" --version`, { timeout: 5000 }, (error: any, stdout: any, stderr: any) => {
								if (error) {
									reject(error);
								} else {
									resolve(stdout.trim());
								}
							});
						});
						console.log('✅ Executable test run successful:', testOutput.split('\n')[0]);
					} catch (testError) {
						console.log('❌ Executable test run failed:', testError.message);
						console.log('This indicates the binary may not be compatible or corrupted');
						return false;
					}
				}
			} catch (permError) {
				console.error('❌ Executable permissions issue:', permError);
				throw new Error(`Executable not accessible: ${permError.message}`);
			}

			return true;

		} catch (error) {
			console.error('Failed to find and copy executable:', error);
			return false;
		}
	}

	/**
	 * Clean up extracted files, keeping only the renamed executable
	 */
	private cleanupExtractedFiles(dir: string, keepFile: string): void {
		try {
			const fs = require('fs');
			const path = require('path');

			const items = fs.readdirSync(dir);
			
			for (const item of items) {
				if (item === keepFile) continue; // Keep our executable
				
				const itemPath = path.join(dir, item);
				const stat = fs.statSync(itemPath);
				
				if (stat.isDirectory()) {
					// Remove directory recursively
					fs.rmSync(itemPath, { recursive: true, force: true });
				} else {
					// Remove file
					fs.unlinkSync(itemPath);
				}
			}
		} catch (error) {
			console.error('Cleanup error (non-fatal):', error);
		}
	}

	detectMobilePlatform(): boolean {
		return detectMobilePlatform();
	}

	getPluginAbsolutePath(): string {
        let basePath;

        // Base path
        if (this.app.vault.adapter instanceof FileSystemAdapter) {
            basePath = this.app.vault.adapter.getBasePath();
        } else {
            throw new Error('Cannot determine base path.');
        }

        // Try to dynamically find the actual plugin folder name
        // This handles BRAT beta versions (e.g., obsyncth-1.5.6-beta.7) correctly
        if (!detectMobilePlatform() && typeof require !== 'undefined') {
            try {
                const fs = require('fs');
                const path = require('path');
                const pluginsDir = path.join(basePath, this.app.vault.configDir, 'plugins');
                
                if (fs.existsSync(pluginsDir)) {
                    const folders = fs.readdirSync(pluginsDir);
                    
                    // Find the folder that contains our main.js file (this running instance)
                    for (const folder of folders) {
                        if (folder.startsWith(this.manifest.id + '-') || folder === this.manifest.id) {
                            const mainJsPath = path.join(pluginsDir, folder, 'main.js');
                            if (fs.existsSync(mainJsPath)) {
                                return `${basePath}/${this.app.vault.configDir}/plugins/${folder}/`;
                            }
                        }
                    }
                }
            } catch (e) {
                console.log('Could not dynamically detect plugin folder:', e);
            }
        }

        // Fallback: Use manifest id and version (traditional method)
        const relativePath = `${this.app.vault.configDir}/plugins/${this.manifest.id}-${this.manifest.version}/`;
        return `${basePath}/${relativePath}`;
    }

	getSyncthingExecutablePath(): string {
		const pluginPath = this.getPluginAbsolutePath();
		
		// Use persistent folder name without versioning
		const binaryFolderPath = `${pluginPath}Syncthing binary-config/`;
		
		// Detect platform and return appropriate executable path
		if (platformInfo.platform === 'win32') {
			return `${binaryFolderPath}syncthing.exe`;
		} else if (platformInfo.platform === 'darwin') {
			return `${binaryFolderPath}syncthing-macos`;
		} else {
			// Linux and other Unix-like systems
			return `${binaryFolderPath}syncthing-linux`;
		}
	}

	/**
	 * Get the last sync date using Node.js HTTP
	 */
	async getLastSyncDate() {
		return new Promise<Date | null>((resolve) => {
			if (!this.settings.syncthingApiKey || !this.settings.vaultFolderID) {
				resolve(null);
				return;
			}

		const url = new URL(this.getSyncthingURL());
		
		// Use IPv4 localhost
		let hostname = url.hostname;
		if (hostname === 'localhost' || hostname === '::1') {
			hostname = '127.0.0.1'; // Force IPv4 for localhost
		}			const options = {
				hostname: hostname,
				port: parseInt(url.port) || 8384,
				path: `/rest/db/status?folder=${this.settings.vaultFolderID}`,
				method: 'GET',
				headers: {
					'X-API-Key': this.settings.syncthingApiKey,
				}
			};

			const req = http.request(options, (res) => {
				let body = '';
				res.on('data', chunk => body += chunk);
				res.on('end', () => {
					try {
						const data = JSON.parse(body);
						if (data.stateChanged) {
							resolve(new Date(data.stateChanged));
						} else {
							resolve(null);
						}
					} catch (error) {
						console.error('Failed to parse sync date response:', error);
						resolve(null);
					}
				});
			});

			req.on('error', (error) => {
				console.error('Failed to get last sync date:', error);
				resolve(null);
			});

			req.end();
		});
	}

	// --- Settings ---

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		
		// Update ignore patterns when settings change
		this.updateIgnorePatterns();
		
		// Restart monitoring with new settings
		this.monitor.stopMonitoring();
		setTimeout(() => {
			this.startStatusMonitoring();
		}, 1000);
	}
}

class SettingTab extends PluginSettingTab {
	plugin: Obsyncth;
	private activeTab = 'overview';
	private refreshInterval: NodeJS.Timeout | null = null;

	constructor(app: App, plugin: Obsyncth) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Main container
		containerEl.createDiv('syncthing-settings', (settingsEl) => {
			// Tab navigation
			const tabsEl = settingsEl.createDiv('syncthing-tabs');
			
			const tabs = [
				{ id: 'overview', label: 'Overview', icon: '📊' },
				{ id: 'configuration', label: 'Configuration', icon: '⚙️' },
				{ id: 'filemanager', label: 'File Manager', icon: '📁' },
				{ id: 'advanced', label: 'Advanced', icon: '🔧' },
				{ id: 'about', label: 'About', icon: 'ℹ️' }
			];

			tabs.forEach(tab => {
				const tabEl = tabsEl.createEl('button', {
					cls: `syncthing-tab ${this.activeTab === tab.id ? 'active' : ''}`,
					text: `${tab.icon} ${tab.label}`
				});
				
				tabEl.addEventListener('click', () => {
					this.activeTab = tab.id;
					this.display();
				});
			});

			// Tab content
			this.renderTabContent(settingsEl);
		});

		// Auto-refresh overview tab
		if (this.activeTab === 'overview') {
			this.startAutoRefresh();
		}
	}

	private renderTabContent(container: HTMLElement): void {
		const contentEl = container.createDiv('syncthing-tab-content active');

		switch (this.activeTab) {
			case 'overview':
				this.renderOverviewTab(contentEl);
				break;
			case 'configuration':
				this.renderConfigurationTab(contentEl);
				break;
			case 'filemanager':
				this.renderFileManagerTab(contentEl);
				break;
			case 'advanced':
				this.renderAdvancedTab(contentEl);
				break;
			case 'about':
				this.renderAboutTab(contentEl);
				break;
		}
	}

	private renderOverviewTab(container: HTMLElement): void {
		// Status Card
		const statusCard = container.createDiv('syncthing-status-card');
		
		const statusHeader = statusCard.createDiv('syncthing-status-header');
		statusHeader.createEl('h2', { cls: 'syncthing-status-title', text: 'Syncthing Status' });
		
		const statusIndicator = statusHeader.createSpan('syncthing-status-indicator unknown');
		statusIndicator.textContent = 'Checking...';

		// Status info grid
		const statusInfo = statusCard.createDiv('syncthing-status-info');
		
		const executableItem = statusInfo.createDiv('syncthing-info-item');
		executableItem.createDiv({ cls: 'syncthing-info-label', text: 'Executable' });
		const executableValue = executableItem.createDiv('syncthing-info-value');
		
		// Check executable status based on platform
		if (this.plugin.detectMobilePlatform() || this.plugin.settings.mobileMode) {
			executableValue.textContent = 'Remote Mode';
		} else {
			this.plugin.checkExecutableExists().then(exists => {
				executableValue.textContent = exists ? 'Found' : 'Not found';
			});
		}

		const configItem = statusInfo.createDiv('syncthing-info-item');
		configItem.createDiv({ cls: 'syncthing-info-label', text: 'API Key' });
		const configValue = configItem.createDiv('syncthing-info-value');
		configValue.textContent = this.plugin.settings.syncthingApiKey ? 'Configured' : 'Not configured';

		const modeItem = statusInfo.createDiv('syncthing-info-item');
		modeItem.createDiv({ cls: 'syncthing-info-label', text: 'Mode' });
		const modeValue = modeItem.createDiv('syncthing-info-value');
		const mode = this.plugin.detectMobilePlatform() ? 'Mobile' : (this.plugin.settings.mobileMode ? 'Remote' : 'Desktop');
		modeValue.textContent = mode;

		const urlItem = statusInfo.createDiv('syncthing-info-item');
		urlItem.createDiv({ cls: 'syncthing-info-label', text: 'URL' });
		const urlValue = urlItem.createDiv('syncthing-info-value');
		urlValue.textContent = this.plugin.getSyncthingURL();

		// Additional status info from monitor
		const devicesItem = statusInfo.createDiv('syncthing-info-item');
		devicesItem.createDiv({ cls: 'syncthing-info-label', text: 'Devices' });
		const devicesValue = devicesItem.createDiv('syncthing-info-value');
		devicesValue.textContent = '0/0';

		const syncItem = statusInfo.createDiv('syncthing-info-item');
		syncItem.createDiv({ cls: 'syncthing-info-label', text: 'Sync Progress' });
		const syncValue = syncItem.createDiv('syncthing-info-value');
		syncValue.textContent = 'Unknown';

		// Controls - adapt based on platform
		const controls = statusCard.createDiv('syncthing-controls');
		
		if (!this.plugin.detectMobilePlatform() && !this.plugin.settings.mobileMode) {
			// Desktop controls
			const startBtn = controls.createEl('button', {
				cls: 'syncthing-btn success',
				text: '🚀 Start'
			});
			startBtn.addEventListener('click', async () => {
				try {
					await this.plugin.startSyncthing();
					new Notice('Syncthing started successfully');
					this.updateStatus();
				} catch (error) {
					new Notice(`Failed to start Syncthing: ${error.message}`);
				}
			});

			const stopBtn = controls.createEl('button', {
				cls: 'syncthing-btn danger',
				text: '⏹️ Stop'
			});
			stopBtn.addEventListener('click', async () => {
				try {
					await this.plugin.stopSyncthing();
					new Notice('Syncthing stopped');
					this.updateStatus();
				} catch (error) {
					new Notice(`Failed to stop Syncthing: ${error.message}`);
				}
			});

			const restartBtn = controls.createEl('button', {
				cls: 'syncthing-btn secondary',
				text: '🔄 Restart'
			});
			restartBtn.addEventListener('click', async () => {
				try {
					await this.plugin.stopSyncthing();
					await new Promise(resolve => setTimeout(resolve, 2000)); // Wait longer for cleanup
					await this.plugin.startSyncthing();
					new Notice('Syncthing restarted');
					this.updateStatus();
				} catch (error) {
					new Notice(`Failed to restart Syncthing: ${error.message}`);
				}
			});
		}

		// Universal controls (work on both desktop and mobile)
		const openBtn = controls.createEl('button', {
			cls: 'syncthing-btn primary',
			text: '🌐 Open GUI'
		});
		openBtn.addEventListener('click', () => {
			const url = this.plugin.getSyncthingURL();
			window.open(url, '_blank');
		});

		const refreshBtn = controls.createEl('button', {
			cls: 'syncthing-btn secondary',
			text: '🔄 Refresh Status'
		});
		refreshBtn.addEventListener('click', () => this.updateStatus());

		// Wire up real-time status updates from monitor
		const updateStatusFromMonitor = (data: any) => {
			let statusText = '❓ Unknown';
			let statusClass = 'unknown';

			if (data.status === "Invalid API key") {
				statusText = 'Invalid API key';
				statusClass = 'stopped';
			} else if (data.status === "API key not set") {
				statusText = 'API key not set';
				statusClass = 'stopped';
			} else if (data.connectedDevicesCount === 0) {
				statusText = 'No devices connected';
				statusClass = 'stopped';
			} else if (data.status === "scanning") {
				statusText = 'Scanning';
				statusClass = 'running';
			} else if (data.fileCompletion !== undefined && data.fileCompletion < 100) {
				statusText = `Syncing (${data.fileCompletion.toFixed(1)}%)`;
				statusClass = 'running';
			} else if (data.connectedDevicesCount > 0) {
				statusText = 'Connected';
				statusClass = 'running';
			}

			// Update status indicator
			statusIndicator.className = `syncthing-status-indicator ${statusClass}`;
			statusIndicator.textContent = statusText;

			// Update devices info
			if (data.availableDevices !== undefined && data.connectedDevicesCount !== undefined) {
				devicesValue.textContent = `${data.connectedDevicesCount}/${data.availableDevices}`;
			}

			// Update sync progress
			if (data.fileCompletion !== undefined && !isNaN(data.fileCompletion)) {
				syncValue.textContent = `${data.fileCompletion.toFixed(1)}%`;
			} else if (data.status === "scanning") {
				syncValue.textContent = 'Scanning...';
			} else if (data.connectedDevicesCount > 0) {
				syncValue.textContent = 'Up to date';
			} else {
				syncValue.textContent = 'Unknown';
			}
		};

		// Remove any existing listeners to prevent duplicates
		this.plugin.monitor.off('status-update', updateStatusFromMonitor);
		// Add the new listener
		this.plugin.monitor.on('status-update', updateStatusFromMonitor);

		// Update status immediately
		this.updateStatus();
	}

	private renderConfigurationTab(container: HTMLElement): void {
		// API Configuration Section
		const apiSection = container.createDiv('syncthing-section');
		apiSection.createEl('h3', { cls: 'syncthing-section-title', text: '🔗 API Configuration' });
		apiSection.createDiv({
			cls: 'syncthing-section-description',
			text: 'Configure connection to Syncthing API. Find these settings in Syncthing GUI → Actions → Settings.'
		});

		const apiKeyGroup = apiSection.createDiv('syncthing-form-group');
		apiKeyGroup.createEl('label', { cls: 'syncthing-label', text: 'API Key' });
		const apiKeyInput = apiKeyGroup.createEl('input', {
			cls: 'syncthing-input',
			attr: { type: 'password', value: this.plugin.settings.syncthingApiKey, placeholder: 'Enter Syncthing API key' }
		});
		apiKeyGroup.createDiv({
			cls: 'syncthing-help-text',
			text: 'API key for authentication (found in Syncthing GUI → Settings → GUI)'
		});

		// Auto-save API key on input
		apiKeyInput.addEventListener('input', async () => {
			this.plugin.settings.syncthingApiKey = apiKeyInput.value;
			await this.plugin.saveSettings();
		});

		// Connection Mode Section
		const modeSection = container.createDiv('syncthing-section');
		modeSection.createEl('h3', { cls: 'syncthing-section-title', text: '📱 Connection Mode' });
		modeSection.createDiv({
			cls: 'syncthing-section-description',
			text: 'Choose how to connect to Syncthing: run locally or use Docker.'
		});

		// Only show Docker option on desktop platforms
		if (!this.plugin.detectMobilePlatform()) {
			const dockerGroup = modeSection.createDiv('syncthing-form-group');
			const dockerCheckbox = dockerGroup.createEl('label', { cls: 'syncthing-checkbox' });
			const dockerInput = dockerCheckbox.createEl('input', { attr: { type: 'checkbox' } });
			dockerInput.checked = this.plugin.settings.useDocker;
			dockerCheckbox.createSpan({ text: 'Use Docker (run Syncthing in container)' });

			// Auto-save docker mode setting
			dockerInput.addEventListener('change', async () => {
				this.plugin.settings.useDocker = dockerInput.checked;
				await this.plugin.saveSettings();
			});
		} else {
			// Show info for mobile users
			const mobileInfo = modeSection.createDiv('syncthing-info-card');
			mobileInfo.createEl('div', { 
				cls: 'syncthing-info-text',
				text: '📱 Mobile Mode Active: Connect to remote Syncthing instance' 
			});
		}

		const remoteUrlGroup = modeSection.createDiv('syncthing-form-group');
		remoteUrlGroup.createEl('label', { cls: 'syncthing-label', text: 'Remote Syncthing URL' });
		const remoteUrlInput = remoteUrlGroup.createEl('input', {
			cls: 'syncthing-input',
			attr: { type: 'text', value: this.plugin.settings.remoteUrl, placeholder: 'http://192.168.1.100:8384' }
		});
		remoteUrlGroup.createDiv({
			cls: 'syncthing-help-text',
			text: 'URL of remote Syncthing instance (used in mobile mode)'
		});

		// Auto-save remote URL on input
		remoteUrlInput.addEventListener('input', async () => {
			this.plugin.settings.remoteUrl = remoteUrlInput.value;
			await this.plugin.saveSettings();
		});

		// Remote Authentication Section
		const authSection = modeSection.createDiv('syncthing-auth-section');
		authSection.createEl('h4', { cls: 'syncthing-subsection-title', text: 'Remote Authentication (Optional)' });
		authSection.createDiv({
			cls: 'syncthing-help-text',
			text: 'If your remote Syncthing requires basic authentication, enter credentials below:'
		});

		const usernameGroup = authSection.createDiv('syncthing-form-group');
		usernameGroup.createEl('label', { cls: 'syncthing-label', text: 'Username' });
		const usernameInput = usernameGroup.createEl('input', {
			cls: 'syncthing-input',
			attr: { type: 'text', value: this.plugin.settings.remoteUsername, placeholder: 'username' }
		});

		// Auto-save username on input
		usernameInput.addEventListener('input', async () => {
			this.plugin.settings.remoteUsername = usernameInput.value;
			await this.plugin.saveSettings();
		});

		const passwordGroup = authSection.createDiv('syncthing-form-group');
		passwordGroup.createEl('label', { cls: 'syncthing-label', text: 'Password' });
		const passwordInput = passwordGroup.createEl('input', {
			cls: 'syncthing-input',
			attr: { type: 'password', value: this.plugin.settings.remotePassword, placeholder: 'password' }
		});

		// Auto-save password on input
		passwordInput.addEventListener('input', async () => {
			this.plugin.settings.remotePassword = passwordInput.value;
			await this.plugin.saveSettings();
		});

		// Startup Configuration Section
		const startupSection = container.createDiv('syncthing-section');
		startupSection.createEl('h3', { cls: 'syncthing-section-title', text: '🚀 Startup Configuration' });
		startupSection.createDiv({
			cls: 'syncthing-section-description',
			text: 'Control when Syncthing starts and stops with Obsidian.'
		});

		const autoStartGroup = startupSection.createDiv('syncthing-form-group');
		const autoStartCheckbox = autoStartGroup.createEl('label', { cls: 'syncthing-checkbox' });
		const autoStartInput = autoStartCheckbox.createEl('input', { attr: { type: 'checkbox' } });
		autoStartInput.checked = this.plugin.settings.startOnObsidianOpen;
		autoStartCheckbox.createSpan({ text: 'Start Syncthing when Obsidian opens' });

		// Auto-save startup setting
		autoStartInput.addEventListener('change', async () => {
			this.plugin.settings.startOnObsidianOpen = autoStartInput.checked;
			await this.plugin.saveSettings();
		});

		const autoStopGroup = startupSection.createDiv('syncthing-form-group');
		const autoStopCheckbox = autoStopGroup.createEl('label', { cls: 'syncthing-checkbox' });
		const autoStopInput = autoStopCheckbox.createEl('input', { attr: { type: 'checkbox' } });
		autoStopInput.checked = this.plugin.settings.stopOnObsidianClose;
		autoStopCheckbox.createSpan({ text: 'Stop Syncthing when Obsidian closes' });

		// Auto-save shutdown setting
		autoStopInput.addEventListener('change', async () => {
			this.plugin.settings.stopOnObsidianClose = autoStopInput.checked;
			await this.plugin.saveSettings();
		});

		// Save button (now redundant since all fields auto-save, but keeping for user feedback)
		const saveBtn = container.createEl('button', {
			cls: 'syncthing-btn primary',
			text: '💾 Manual Save & Refresh'
		});
		saveBtn.addEventListener('click', async () => {
			// Force save all current values (though they should already be saved)
			this.plugin.settings.syncthingApiKey = apiKeyInput.value;
			this.plugin.settings.remoteUrl = remoteUrlInput.value;
			this.plugin.settings.startOnObsidianOpen = autoStartInput.checked;
			this.plugin.settings.stopOnObsidianClose = autoStopInput.checked;

			// Only save Docker setting on desktop
			if (!this.plugin.detectMobilePlatform()) {
				// Find the docker input if it exists
				const dockerInput = container.querySelector('input[type="checkbox"]');
				if (dockerInput && dockerInput !== autoStartInput && dockerInput !== autoStopInput) {
					this.plugin.settings.useDocker = (dockerInput as HTMLInputElement).checked;
				}
			}

			await this.plugin.saveSettings();
			new Notice('Configuration refreshed and saved successfully');
			
			// Refresh the overview tab to show updated settings
			if (this.activeTab === 'configuration') {
				this.display();
			}
		});
	}

	private renderAdvancedTab(container: HTMLElement): void {
		// Check if we're on mobile and show appropriate content
		if (this.plugin.detectMobilePlatform() || this.plugin.settings.mobileMode) {
			this.renderMobileAdvancedTab(container);
			return;
		}
		
		// Desktop Advanced Tab
		this.renderDesktopAdvancedTab(container);
	}

	private renderMobileAdvancedTab(container: HTMLElement): void {
		// Mobile-specific advanced options
		const mobileSection = container.createDiv('syncthing-section');
		mobileSection.createEl('h3', { cls: 'syncthing-section-title', text: '📱 Mobile Options' });
		mobileSection.createDiv({
			cls: 'syncthing-section-description',
			text: 'Advanced options for mobile Syncthing management.'
		});

		// Connection diagnostics
		const diagnosticSection = container.createDiv('syncthing-section');
		diagnosticSection.createEl('h3', { cls: 'syncthing-section-title', text: '🔍 Connection Diagnostics' });
		
		const diagnosticControls = diagnosticSection.createDiv('syncthing-controls');
		
		const testConnBtn = diagnosticControls.createEl('button', {
			cls: 'syncthing-btn primary',
			text: '🔗 Test Connection'
		});
		testConnBtn.addEventListener('click', async () => {
			try {
				testConnBtn.disabled = true;
				testConnBtn.textContent = '⏳ Testing...';
				
				const url = this.plugin.getSyncthingURL();
				// Create auth headers with API key and optional basic auth
				const headers: HeadersInit = {
					'X-API-Key': this.plugin.settings.syncthingApiKey
				};

				// Add basic authentication if username/password are provided
				if (this.plugin.settings.remoteUsername && this.plugin.settings.remotePassword) {
					const credentials = btoa(`${this.plugin.settings.remoteUsername}:${this.plugin.settings.remotePassword}`);
					headers['Authorization'] = `Basic ${credentials}`;
				}

				// Simple connection test - just try to get system status
				const response = await fetch(`${url}/rest/system/status`, { headers });
				
				if (response.ok) {
					new Notice('✅ Connection successful');
				} else if (response.status === 401) {
					new Notice(`❌ Authentication failed. Check your API key and credentials.`);
				} else {
					new Notice(`❌ Connection failed to ${url} (${response.status})`);
				}
			} catch (error) {
				new Notice(`Connection test failed: ${error.message}`);
			} finally {
				testConnBtn.disabled = false;
				testConnBtn.textContent = '🔗 Test Connection';
			}
		});

		const refreshStatusBtn = diagnosticControls.createEl('button', {
			cls: 'syncthing-btn secondary',
			text: '🔄 Refresh Status'
		});
		refreshStatusBtn.addEventListener('click', () => {
			// Simple status refresh
			this.plugin.updateStatusBar();
			new Notice('Status refreshed');
		});

		// Remote control section (mobile-appropriate)
		const remoteSection = container.createDiv('syncthing-section');
		remoteSection.createEl('h3', { cls: 'syncthing-section-title', text: '🎛️ Remote Control' });
		
		const remoteControls = remoteSection.createDiv('syncthing-controls');
		
		const pauseBtn = remoteControls.createEl('button', {
			cls: 'syncthing-btn secondary',
			text: '⏸️ Pause Sync'
		});
		pauseBtn.addEventListener('click', async () => {
			try {
				const success = await this.plugin.pauseSyncthing();
				if (success) {
					new Notice('Syncthing paused successfully');
				} else {
					new Notice('Failed to pause Syncthing');
				}
			} catch (error) {
				new Notice(`Failed to pause Syncthing: ${error.message}`);
			}
		});

		const resumeBtn = remoteControls.createEl('button', {
			cls: 'syncthing-btn success',
			text: '▶️ Resume Sync'
		});
		resumeBtn.addEventListener('click', async () => {
			try {
				const success = await this.plugin.resumeSyncthing();
				if (success) {
					new Notice('Syncthing resumed successfully');
				} else {
					new Notice('Failed to resume Syncthing');
				}
			} catch (error) {
				new Notice(`Failed to resume Syncthing: ${error.message}`);
			}
		});

		// Mobile info section
		const infoSection = container.createDiv('syncthing-section');
		infoSection.createEl('h3', { cls: 'syncthing-section-title', text: 'ℹ️ Platform Information' });
		
		const infoCard = infoSection.createDiv('syncthing-diagnostic');
		infoCard.createDiv({ cls: 'syncthing-diagnostic-title', text: 'Mobile Platform Details' });
		
		const platformItem = infoCard.createDiv('syncthing-diagnostic-item');
		platformItem.createSpan({ cls: 'syncthing-diagnostic-label', text: 'Platform:' });
		platformItem.createSpan({ cls: 'syncthing-diagnostic-value', text: `${platformInfo.platform} ${platformInfo.arch}` });

		const modeItem = infoCard.createDiv('syncthing-diagnostic-item');
		modeItem.createSpan({ cls: 'syncthing-diagnostic-label', text: 'Mode:' });
		modeItem.createSpan({ cls: 'syncthing-diagnostic-value', text: 'Remote/Mobile' });

		const urlItem = infoCard.createDiv('syncthing-diagnostic-item');
		urlItem.createSpan({ cls: 'syncthing-diagnostic-label', text: 'Target URL:' });
		urlItem.createSpan({ cls: 'syncthing-diagnostic-value', text: this.plugin.getSyncthingURL() });
	}

	private renderDesktopAdvancedTab(container: HTMLElement): void {
		// Binary Management Section
		const binarySection = container.createDiv('syncthing-section');
		binarySection.createEl('h3', { cls: 'syncthing-section-title', text: '📦 Binary Management' });
		binarySection.createDiv({
			cls: 'syncthing-section-description',
			text: 'Download, verify, and manage the Syncthing executable.'
		});

		const binaryDiagnostic = binarySection.createDiv('syncthing-diagnostic');
		binaryDiagnostic.createDiv({ cls: 'syncthing-diagnostic-title', text: 'Executable Status' });
		
		const pathItem = binaryDiagnostic.createDiv('syncthing-diagnostic-item');
		pathItem.createSpan({ cls: 'syncthing-diagnostic-label', text: 'Path:' });
		pathItem.createSpan({ 
			cls: 'syncthing-diagnostic-value', 
			text: this.plugin.getSyncthingExecutablePath()
		});

		const statusItem = binaryDiagnostic.createDiv('syncthing-diagnostic-item');
		statusItem.createSpan({ cls: 'syncthing-diagnostic-label', text: 'Status:' });
		const statusValue = statusItem.createSpan({ cls: 'syncthing-diagnostic-value' });
		
		// Check executable status
		this.plugin.checkExecutableExists().then(exists => {
			statusValue.textContent = exists ? 'Found' : 'Not found';
		});

		const binaryControls = binarySection.createDiv('syncthing-controls');
		
		const downloadBtn = binaryControls.createEl('button', {
			cls: 'syncthing-btn primary',
			text: '⬇️ Download'
		});
		downloadBtn.addEventListener('click', async () => {
			downloadBtn.disabled = true;
			downloadBtn.textContent = '⏳ Downloading...';
			try {
				const success = await this.plugin.downloadSyncthingExecutable();
				if (success) {
					new Notice('✅ Syncthing downloaded successfully');
					this.renderDesktopAdvancedTab(container);
				} else {
					new Notice('❌ Download failed');
				}
			} catch (error) {
				new Notice(`Download failed: ${error.message}`);
			} finally {
				downloadBtn.disabled = false;
				downloadBtn.textContent = '⬇️ Download';
			}
		});

		const redownloadBtn = binaryControls.createEl('button', {
			cls: 'syncthing-btn secondary',
			text: '🔄 Re-download'
		});
		redownloadBtn.addEventListener('click', async () => {
			redownloadBtn.disabled = true;
			redownloadBtn.textContent = '⏳ Re-downloading...';
			try {
				// Remove existing executable
				const executablePath = this.plugin.getSyncthingExecutablePath();
				if (fs && path) {
					try {
						const syncthingDir = path.dirname(executablePath);
						if (fs.existsSync(syncthingDir)) {
							fs.rmSync(syncthingDir, { recursive: true, force: true });
						}
					} catch (removeError) {
						console.log('Could not remove existing executable:', removeError);
					}
				}
				
				const success = await this.plugin.downloadSyncthingExecutable();
				if (success) {
					new Notice('✅ Syncthing re-downloaded successfully');
					this.renderDesktopAdvancedTab(container);
				} else {
					new Notice('❌ Re-download failed');
				}
			} catch (error) {
				new Notice(`Re-download failed: ${error.message}`);
			} finally {
				redownloadBtn.disabled = false;
				redownloadBtn.textContent = '🔄 Re-download';
			}
		});

		const checkBtn = binaryControls.createEl('button', {
			cls: 'syncthing-btn secondary',
			text: '✅ Check'
		});
		checkBtn.addEventListener('click', async () => {
			const exists = await this.plugin.checkExecutableExists();
			if (exists) {
				new Notice('✅ Syncthing executable found and accessible');
			} else {
				new Notice('❌ Syncthing executable not found');
			}
		});

		// Control Actions Section
		const controlSection = container.createDiv('syncthing-section');
		controlSection.createEl('h3', { cls: 'syncthing-section-title', text: '🎛️ Control Actions' });
		
		const controlActions = controlSection.createDiv('syncthing-controls');
		
		const pauseBtn = controlActions.createEl('button', {
			cls: 'syncthing-btn secondary',
			text: '⏸️ Pause Sync'
		});
		pauseBtn.addEventListener('click', async () => {
			try {
				const success = await this.plugin.pauseSyncthing();
				if (success) {
					new Notice('Syncthing paused successfully');
				} else {
					new Notice('Failed to pause Syncthing');
				}
			} catch (error) {
				new Notice(`Failed to pause Syncthing: ${error.message}`);
			}
		});

		const resumeBtn = controlActions.createEl('button', {
			cls: 'syncthing-btn success',
			text: '▶️ Resume Sync'
		});
		resumeBtn.addEventListener('click', async () => {
			try {
				const success = await this.plugin.resumeSyncthing();
				if (success) {
					new Notice('Syncthing resumed successfully');
				} else {
					new Notice('Failed to resume Syncthing');
				}
			} catch (error) {
				new Notice(`Failed to resume Syncthing: ${error.message}`);
			}
		});

		const resetBtn = controlActions.createEl('button', {
			cls: 'syncthing-btn danger',
			text: '🔄 Reset Config'
		});
		resetBtn.addEventListener('click', async () => {
			try {
				await this.plugin.stopSyncthing();
				await new Promise(resolve => setTimeout(resolve, 1000));
				
				if (typeof require !== 'undefined') {
					const fs = require('fs');
					const path = require('path');
					const configDir = `${this.plugin.getPluginAbsolutePath()}Syncthing binary-config/syncthing-config`;
					
					if (fs.existsSync(configDir)) {
						fs.rmSync(configDir, { recursive: true, force: true });
						new Notice('Syncthing configuration reset successfully');
					} else {
						new Notice('No configuration found to reset');
					}
				}
			} catch (error) {
				new Notice(`Failed to reset configuration: ${error.message}`);
			}
		});

		// Diagnostics Section
		const diagnosticsSection = container.createDiv('syncthing-section');
		diagnosticsSection.createEl('h3', { cls: 'syncthing-section-title', text: '🔍 System Diagnostics' });
		
		const diagnostics = diagnosticsSection.createDiv('syncthing-diagnostic');
		diagnostics.createDiv({ cls: 'syncthing-diagnostic-title', text: 'System Information' });

		const platformItem = diagnostics.createDiv('syncthing-diagnostic-item');
		platformItem.createSpan({ cls: 'syncthing-diagnostic-label', text: 'Platform:' });
		platformItem.createSpan({ cls: 'syncthing-diagnostic-value', text: `${platformInfo.platform} ${platformInfo.arch}` });

		const nodeItem = diagnostics.createDiv('syncthing-diagnostic-item');
		nodeItem.createSpan({ cls: 'syncthing-diagnostic-label', text: 'Node.js:' });
		nodeItem.createSpan({ cls: 'syncthing-diagnostic-value', text: process.version });

		const pluginItem = diagnostics.createDiv('syncthing-diagnostic-item');
		pluginItem.createSpan({ cls: 'syncthing-diagnostic-label', text: 'Plugin Version:' });
		pluginItem.createSpan({ cls: 'syncthing-diagnostic-value', text: this.plugin.manifest.version });

		// Debug Actions
		const debugControls = diagnosticsSection.createDiv('syncthing-controls');
		
		const logsBtn = debugControls.createEl('button', {
			cls: 'syncthing-btn secondary',
			text: '📋 View Logs'
		});
		logsBtn.addEventListener('click', () => {
			console.log('Syncthing Plugin Debug Info:', {
				settings: this.plugin.settings,
				executablePath: this.plugin.getSyncthingExecutablePath(),
				platform: platformInfo.platform,
				arch: platformInfo.arch
			});
			new Notice('Debug info logged to console (F12)');
		});

		const testBtn = debugControls.createEl('button', {
			cls: 'syncthing-btn secondary',
			text: '🧪 Test Connection'
		});
		testBtn.addEventListener('click', async () => {
			try {
				const isRunning = await this.plugin.isSyncthingRunning();
				if (isRunning) {
					new Notice('✅ Connection successful - Syncthing is running');
				} else {
					new Notice('❌ Connection failed - Syncthing not running');
				}
			} catch (error) {
				new Notice(`❌ Connection test failed: ${error.message}`);
			}
		});
	}

	private renderAboutTab(container: HTMLElement): void {
		const aboutEl = container.createDiv('syncthing-about');
		
		aboutEl.createDiv({ cls: 'syncthing-logo', text: '🔄' });
		aboutEl.createEl('h2', { cls: 'syncthing-about-title', text: 'Obsyncth' });
		aboutEl.createDiv({ 
			cls: 'syncthing-about-version', 
			text: `Version ${this.plugin.manifest.version}` 
		});
		
		aboutEl.createDiv({
			cls: 'syncthing-about-description',
			text: 'This plugin provides seamless integration between Obsidian and Syncthing, enabling you to automatically sync your vault across devices with Syncthing\'s peer-to-peer file synchronization.'
		});

		const linksEl = aboutEl.createDiv('syncthing-links');
		
		const githubLink = linksEl.createEl('a', {
			cls: 'syncthing-link',
			text: '📚 GitHub Repository',
			href: '#'
		});
		githubLink.addEventListener('click', (e) => {
			e.preventDefault();
			window.open('https://github.com/muxammadreza/Obsyncth', '_blank');
		});

		const syncthingLink = linksEl.createEl('a', {
			cls: 'syncthing-link',
			text: '🌐 Syncthing.net',
			href: '#'
		});
		syncthingLink.addEventListener('click', (e) => {
			e.preventDefault();
			window.open('https://syncthing.net', '_blank');
		});

		const docsLink = linksEl.createEl('a', {
			cls: 'syncthing-link',
			text: '📖 Documentation',
			href: '#'
		});
		docsLink.addEventListener('click', (e) => {
			e.preventDefault();
			window.open('https://docs.syncthing.net', '_blank');
		});

		// Feature highlights
		const featuresSection = container.createDiv('syncthing-section');
		featuresSection.createEl('h3', { cls: 'syncthing-section-title', text: '✨ Features' });
		
		const featuresList = featuresSection.createEl('ul');
		const features = [
			'Automatic Syncthing download and installation',
			'Cross-platform support (Windows, macOS, Linux)',
			'Configurable auto-start with Obsidian',
			'Web UI integration for advanced configuration', 
			'Real-time status monitoring',
			'Mobile mode for remote connections',
			'Docker support for containerized deployment'
		];

		features.forEach(feature => {
			featuresList.createEl('li', { text: feature });
		});
	}

	private renderFileManagerTab(container: HTMLElement): void {
		// File Manager Header
		const headerSection = container.createDiv('syncthing-section');
		headerSection.createEl('h3', { cls: 'syncthing-section-title', text: '📁 File Manager' });
		headerSection.createDiv({
			cls: 'syncthing-section-description',
			text: 'Select files and folders to sync. Unselected items will be ignored by Syncthing.'
		});

		// iOS Folder Picker (only on mobile)
		if (this.plugin.detectMobilePlatform() || this.plugin.settings.mobileMode) {
			const pickerSection = container.createDiv('syncthing-section');
			pickerSection.createEl('h4', { cls: 'syncthing-section-subtitle', text: '📱 iOS Folder Selection' });
			
			const pickerBtn = pickerSection.createEl('button', {
				cls: 'syncthing-btn primary',
				text: '📂 Select Vault Folder'
			});
			
			pickerBtn.addEventListener('click', async () => {
				if (!this.plugin.iosFileManager) {
					new Notice('iOS File Manager not initialized', 3000);
					return;
				}
				
				new Notice('Opening iOS folder picker...', 3000);
				const result = await this.plugin.iosFileManager.selectVaultFolder();
				
				if (result.success && result.filesProcessed > 0) {
					this.plugin.settings.selectedVaultPath = result.selectedPath || 'Selected Directory';
					this.plugin.settings.syncedFiles = this.plugin.iosFileManager.getSyncedFiles();
					await this.plugin.saveSettings();
					new Notice(`Folder processed successfully! Found ${result.filesProcessed} items.`, 5000);
					// Clear the container and re-render to show the updated file tree
					container.empty();
					this.renderFileManagerTab(container);
				} else {
					const errorMsg = result.error || 'No folder selected or processing failed';
					new Notice(errorMsg, 3000);
				}
			});
			
			// Show folder status
			const statusDiv = pickerSection.createDiv('syncthing-info-card');
			if (this.plugin.settings.selectedVaultPath && Object.keys(this.plugin.settings.syncedFiles).length > 0) {
				statusDiv.createEl('div', {
					cls: 'syncthing-info-text',
					text: `✅ Folder: ${this.plugin.settings.selectedVaultPath} (${Object.keys(this.plugin.settings.syncedFiles).length} items)`
				});
			} else {
				statusDiv.createEl('div', {
					cls: 'syncthing-info-text',
					text: '⚠️ No folder selected - use the button above to select your vault folder'
				});
			}
		}

		// File Tree Section
		const treeSection = container.createDiv('syncthing-section');
		treeSection.createEl('h4', { cls: 'syncthing-section-subtitle', text: '🌳 File Tree' });
		
		// Navigation and controls
		const controlsDiv = treeSection.createDiv('syncthing-file-controls');
		
		const navDiv = controlsDiv.createDiv('syncthing-file-nav');
		const currentPathSpan = navDiv.createSpan({ cls: 'syncthing-current-path', text: 'Loading...' });
		
		const actionsDiv = controlsDiv.createDiv('syncthing-file-actions');
		
		const selectAllBtn = actionsDiv.createEl('button', {
			cls: 'syncthing-btn secondary small',
			text: '✅ Select All'
		});
		
		const deselectAllBtn = actionsDiv.createEl('button', {
			cls: 'syncthing-btn secondary small',
			text: '❌ Deselect All'
		});
		
		const applyPatternsBtn = actionsDiv.createEl('button', {
			cls: 'syncthing-btn primary small',
			text: '💾 Apply to Syncthing'
		});

		// File listing container
		const fileListContainer = treeSection.createDiv('syncthing-file-list');
		
		// State for current directory
		let currentPath = '';
		
		// Function to render directory listing
		const renderDirectoryListing = async (path: string = '') => {
			try {
				currentPath = path;
				currentPathSpan.textContent = path || '/';
				
				const listing = await this.plugin.getDirectoryListing(path);
				fileListContainer.empty();
				
				// Back button if not at root
				if (listing.canGoUp) {
					const backItem = fileListContainer.createDiv('syncthing-file-item folder');
					backItem.createSpan({ cls: 'syncthing-file-icon', text: '📁' });
					backItem.createSpan({ cls: 'syncthing-file-name', text: '..' });
					backItem.addEventListener('click', () => {
						renderDirectoryListing(listing.parentPath || '');
					});
				}
				
				// Render items
				listing.items.forEach(item => {
					const itemEl = fileListContainer.createDiv(`syncthing-file-item ${item.type}${item.isHidden ? ' hidden' : ''}`);
					
					// Checkbox for selection
					const checkbox = itemEl.createEl('input', { attr: { type: 'checkbox' } });
					checkbox.checked = item.isSelected;
					checkbox.addEventListener('change', async () => {
						await this.plugin.toggleFileSelection(item.path, checkbox.checked);
						// Update visual state
						itemEl.toggleClass('selected', checkbox.checked);
					});
					
					// Icon
					const icon = item.type === 'folder' ? '📁' : '📄';
					itemEl.createSpan({ cls: 'syncthing-file-icon', text: icon });
					
					// Name
					const nameEl = itemEl.createSpan({ cls: 'syncthing-file-name', text: item.name });
					
					// Size (for files)
					if (item.type === 'file' && item.size !== undefined) {
						const sizeText = this.formatFileSize(item.size);
						itemEl.createSpan({ cls: 'syncthing-file-size', text: sizeText });
					}
					
					// Hidden indicator
					if (item.isHidden) {
						itemEl.createSpan({ cls: 'syncthing-file-hidden', text: 'hidden' });
					}
					
					// Make folders clickable
					if (item.type === 'folder') {
						nameEl.style.cursor = 'pointer';
						nameEl.addEventListener('click', () => {
							renderDirectoryListing(item.path);
						});
					}
					
					// Visual state
					if (item.isSelected) {
						itemEl.addClass('selected');
					}
				});
				
				// Show empty state if no items
				if (listing.items.length === 0 && !listing.canGoUp) {
					fileListContainer.createDiv('syncthing-empty-state', (emptyEl) => {
						emptyEl.createSpan({ text: 'No files found. ' });
						if (this.plugin.detectMobilePlatform()) {
							emptyEl.createSpan({ text: 'Use the folder picker above to select your vault.' });
						}
					});
				}
				
			} catch (error) {
				console.error('Error rendering directory listing:', error);
				fileListContainer.empty();
				fileListContainer.createDiv('syncthing-error-state', (errorEl) => {
					errorEl.createSpan({ text: 'Error loading files. ' });
					if (this.plugin.detectMobilePlatform()) {
						errorEl.createSpan({ text: 'Please select a folder using the picker above.' });
					}
				});
			}
		};
		
		// Event handlers
		selectAllBtn.addEventListener('click', async () => {
			Object.keys(this.plugin.settings.syncedFiles).forEach(async (path) => {
				this.plugin.settings.syncedFiles[path] = true;
			});
			await this.plugin.saveSettings();
			this.plugin.updateIgnorePatterns();
			renderDirectoryListing(currentPath);
			new Notice('All files selected for sync', 3000);
		});
		
		deselectAllBtn.addEventListener('click', async () => {
			Object.keys(this.plugin.settings.syncedFiles).forEach(async (path) => {
				this.plugin.settings.syncedFiles[path] = false;
			});
			await this.plugin.saveSettings();
			this.plugin.updateIgnorePatterns();
			renderDirectoryListing(currentPath);
			new Notice('All files deselected from sync', 3000);
		});
		
		applyPatternsBtn.addEventListener('click', async () => {
			new Notice('Applying ignore patterns to Syncthing...', 3000);
			const success = await this.plugin.applySyncthingIgnorePatterns();
			if (success) {
				new Notice('✅ Ignore patterns applied successfully!', 5000);
			} else {
				new Notice('❌ Failed to apply ignore patterns. Check your API key and connection.', 5000);
			}
		});
		
		// Initial load
		renderDirectoryListing('');

		// Ignore Patterns Preview Section
		const patternsSection = container.createDiv('syncthing-section');
		patternsSection.createEl('h4', { cls: 'syncthing-section-subtitle', text: '🚫 Generated Ignore Patterns' });
		patternsSection.createDiv({
			cls: 'syncthing-section-description',
			text: 'These patterns will be applied to Syncthing to ignore unselected files.'
		});
		
		const patternsContainer = patternsSection.createDiv('syncthing-patterns-container');
		const patternsTextarea = patternsContainer.createEl('textarea', {
			cls: 'syncthing-patterns-textarea',
			attr: { 
				readonly: 'true', 
				rows: '10',
				placeholder: 'Ignore patterns will appear here...'
			}
		});
		
		// Update patterns display
		const updatePatternsDisplay = () => {
			this.plugin.updateIgnorePatterns();
			patternsTextarea.value = this.plugin.settings.ignorePatterns.join('\n');
		};
		
		// Initial patterns display
		updatePatternsDisplay();
		
		// Refresh patterns every few seconds if patterns have changed
		const patternsInterval = setInterval(() => {
			if (this.activeTab === 'filemanager') {
				updatePatternsDisplay();
			} else {
				clearInterval(patternsInterval);
			}
		}, 3000);
	}

	private formatFileSize(bytes: number): string {
		const units = ['B', 'KB', 'MB', 'GB'];
		let size = bytes;
		let unitIndex = 0;
		
		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex++;
		}
		
		return `${Math.round(size * 10) / 10} ${units[unitIndex]}`;
	}

	private async updateStatus(): Promise<void> {
		try {
			const isRunning = await this.plugin.isSyncthingRunning();
			this.updateStatusDisplay(isRunning ? 'running' : 'stopped');
		} catch (error) {
			this.updateStatusDisplay('unknown');
		}
	}

	private updateStatusDisplay(status: 'running' | 'stopped' | 'unknown'): void {
		const indicator = this.containerEl.querySelector('.syncthing-status-indicator');
		
		if (indicator) {
			indicator.className = `syncthing-status-indicator ${status}`;
			indicator.textContent = status === 'running' ? 'Running' : status === 'stopped' ? 'Stopped' : 'Unknown';
		}
	}

	private startAutoRefresh(): void {
		this.stopAutoRefresh();
		this.refreshInterval = setInterval(() => {
			if (this.activeTab === 'overview') {
				this.updateStatus();
			}
		}, 10000); // Refresh every 10 seconds
	}

	private stopAutoRefresh(): void {
		if (this.refreshInterval) {
			clearInterval(this.refreshInterval);
			this.refreshInterval = null;
		}
	}

	hide(): void {
		this.stopAutoRefresh();
		super.hide();
	}
}
