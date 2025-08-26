// iOS File Manager - Sushitrain-inspired approach
// Based on research from https://github.com/pixelspark/sushitrain
// Uses Obsidian's native vault APIs instead of WebKit directory picker

import { TFile, TFolder, Vault, TAbstractFile, Notice } from 'obsidian';

export interface IOSFileItem {
    name: string;
    path: string;
    type: 'file' | 'folder';
    isHidden: boolean;
    isSelected: boolean;
    size?: number;
    mtime?: number;
    children?: IOSFileItem[];
}

export interface IOSDirectoryListing {
    path: string;
    items: IOSFileItem[];
    canGoUp: boolean;
    totalItems: number;
    hiddenItems: number;
    accessMethod: 'vault' | 'virtual';
}

export interface IOSFileManagerSettings {
    selectedVaultPath: string;
    syncedFiles: { [path: string]: boolean };
    ignorePatterns: string[];
    allowHiddenFiles: boolean;
    manualFileMapping: { [path: string]: IOSFileItem };
}

/**
 * iOS File Manager - Sushitrain-inspired implementation
 * 
 * Key Features:
 * - Uses Obsidian's native Vault API (like Sushitrain uses photo library API)
 * - Real-time file monitoring (no static snapshots)
 * - Virtual file system approach
 * - Selective sync using ignore patterns
 * - Live updates and file watching
 */
export class IOSFileManager {
    private vault: Vault;
    private settings: IOSFileManagerSettings;
    private vaultFiles: Map<string, IOSFileItem> = new Map();
    private lastScan: number = 0;
    private isInitialized: boolean = false;

    constructor(vault: Vault, settings: IOSFileManagerSettings) {
        this.vault = vault;
        this.settings = { ...settings };
        console.log('IOSFileManager initialized with Sushitrain-inspired approach');
    }

    /**
     * Initialize file manager with vault scanning
     */
    async initialize(): Promise<boolean> {
        try {
            console.log('Initializing iOS File Manager (Sushitrain approach)...');
            
            // Scan vault immediately
            await this.scanVaultFiles();
            
            // Set up file watchers for live updates (like Sushitrain's real-time monitoring)
            this.setupFileWatchers();
            
            this.isInitialized = true;
            console.log(`iOS File Manager ready: ${this.vaultFiles.size} files indexed`);
            return true;
        } catch (error) {
            console.error('iOS File Manager initialization failed:', error);
            return false;
        }
    }

    /**
     * Scan all vault files (Sushitrain approach - use native APIs)
     */
    private async scanVaultFiles(): Promise<void> {
        try {
            console.log('Scanning vault files using native Obsidian API...');
            this.vaultFiles.clear();
            
            // Get all files from vault (like Sushitrain gets files from photo library)
            const allFiles = this.vault.getAllLoadedFiles();
            
            for (const file of allFiles) {
                const item = await this.createFileItemFromVault(file);
                if (item) {
                    this.vaultFiles.set(item.path, item);
                }
            }
            
            // Update settings with discovered files
            this.updateSettingsFromVault();
            this.lastScan = Date.now();
            
            console.log(`Vault scan complete: ${this.vaultFiles.size} files found`);
        } catch (error) {
            console.error('Vault scanning error:', error);
        }
    }

    /**
     * Create file item from Obsidian vault file
     */
    private async createFileItemFromVault(file: TAbstractFile): Promise<IOSFileItem | null> {
        try {
            const isFile = file instanceof TFile;
            const isFolder = file instanceof TFolder;
            
            if (!isFile && !isFolder) return null;
            
            const item: IOSFileItem = {
                name: file.name,
                path: file.path,
                type: isFile ? 'file' : 'folder',
                isHidden: file.name.startsWith('.'),
                isSelected: this.settings.syncedFiles[file.path] !== false, // Default to selected
            };
            
            if (isFile) {
                const tfile = file as TFile;
                item.size = tfile.stat.size;
                item.mtime = tfile.stat.mtime;
            }
            
            return item;
        } catch (error) {
            console.error(`Error creating file item for ${file.path}:`, error);
            return null;
        }
    }

    /**
     * Setup file watchers for live updates (Sushitrain approach)
     */
    private setupFileWatchers(): void {
        console.log('Setting up vault file watchers for live updates...');
        
        // Listen for file creation
        this.vault.on('create', async (file) => {
            const item = await this.createFileItemFromVault(file);
            if (item) {
                this.vaultFiles.set(item.path, item);
                this.updateSettingsFromVault();
                console.log(`File created: ${file.path}`);
            }
        });
        
        // Listen for file deletion
        this.vault.on('delete', (file) => {
            this.vaultFiles.delete(file.path);
            delete this.settings.syncedFiles[file.path];
            console.log(`File deleted: ${file.path}`);
        });
        
        // Listen for file modification
        this.vault.on('modify', async (file) => {
            const item = await this.createFileItemFromVault(file);
            if (item) {
                this.vaultFiles.set(item.path, item);
                console.log(`File modified: ${file.path}`);
            }
        });
        
        // Listen for file rename
        this.vault.on('rename', async (file, oldPath) => {
            this.vaultFiles.delete(oldPath);
            delete this.settings.syncedFiles[oldPath];
            
            const item = await this.createFileItemFromVault(file);
            if (item) {
                this.vaultFiles.set(item.path, item);
                this.settings.syncedFiles[item.path] = this.settings.syncedFiles[oldPath] || true;
            }
            console.log(`File renamed: ${oldPath} -> ${file.path}`);
        });
    }

    /**
     * Update settings from current vault state
     */
    private updateSettingsFromVault(): void {
        const newSyncedFiles: { [path: string]: boolean } = {};
        
        for (const [path, item] of this.vaultFiles) {
            // Preserve existing selection state or default to true
            newSyncedFiles[path] = this.settings.syncedFiles[path] !== false;
        }
        
        this.settings.syncedFiles = newSyncedFiles;
        this.settings.selectedVaultPath = 'Obsidian Vault';
    }

    /**
     * Select vault folder (Sushitrain approach - immediate vault access)
     */
    async selectVaultFolder(): Promise<{ success: boolean; selectedPath: string | null; filesProcessed: number; error?: string }> {
        try {
            console.log('Selecting vault folder using native Obsidian API...');
            
            // Ensure we have the latest vault state
            await this.scanVaultFiles();
            
            const filesProcessed = this.vaultFiles.size;
            
            if (filesProcessed > 0) {
                return {
                    success: true,
                    selectedPath: 'Obsidian Vault',
                    filesProcessed
                };
            } else {
                return {
                    success: false,
                    selectedPath: null,
                    filesProcessed: 0,
                    error: 'No files found in vault'
                };
            }
        } catch (error) {
            return {
                success: false,
                selectedPath: null,
                filesProcessed: 0,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Get current synced files
     */
    getSyncedFiles(): { [path: string]: boolean } {
        return { ...this.settings.syncedFiles };
    }

    /**
     * Get directory listing (Sushitrain approach - virtual filesystem)
     */
    async getDirectoryListing(currentPath: string = ''): Promise<IOSDirectoryListing> {
        try {
            // Refresh vault if needed
            if (Date.now() - this.lastScan > 5000) { // 5 second cache
                await this.scanVaultFiles();
            }
            
            const items: IOSFileItem[] = [];
            const processedPaths = new Set<string>();
            
            // Get items at current path level
            for (const [filePath, fileItem] of this.vaultFiles) {
                let shouldInclude = false;
                let displayPath = '';
                
                if (currentPath === '') {
                    // Root level - show top-level items
                    const topLevel = filePath.split('/')[0];
                    if (!processedPaths.has(topLevel)) {
                        processedPaths.add(topLevel);
                        shouldInclude = true;
                        displayPath = topLevel;
                    }
                } else {
                    // Subdirectory level
                    const prefix = currentPath + '/';
                    if (filePath.startsWith(prefix)) {
                        const relativePath = filePath.substring(prefix.length);
                        const nextLevel = relativePath.split('/')[0];
                        const fullPath = currentPath + '/' + nextLevel;
                        
                        if (!processedPaths.has(nextLevel)) {
                            processedPaths.add(nextLevel);
                            shouldInclude = true;
                            displayPath = fullPath;
                        }
                    }
                }
                
                if (shouldInclude) {
                    // Check if this is a folder (has children)
                    const isFolder = Array.from(this.vaultFiles.keys()).some(p => 
                        p.startsWith(displayPath + '/') && p !== displayPath
                    );
                    
                    const item: IOSFileItem = {
                        name: displayPath.split('/').pop() || displayPath,
                        path: displayPath,
                        type: isFolder ? 'folder' : 'file',
                        isHidden: displayPath.startsWith('.'),
                        isSelected: this.settings.syncedFiles[displayPath] !== false,
                        size: fileItem.size,
                        mtime: fileItem.mtime
                    };
                    
                    items.push(item);
                }
            }
            
            // Sort items: folders first, then files
            items.sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === 'folder' ? -1 : 1;
                }
                if (!this.settings.allowHiddenFiles) {
                    if (a.isHidden !== b.isHidden) {
                        return a.isHidden ? 1 : -1;
                    }
                }
                return a.name.localeCompare(b.name);
            });
            
            const hiddenItems = items.filter(item => item.isHidden).length;
            
            return {
                path: currentPath,
                items: this.settings.allowHiddenFiles ? items : items.filter(item => !item.isHidden),
                canGoUp: currentPath !== '',
                totalItems: items.length,
                hiddenItems,
                accessMethod: 'vault'
            };
        } catch (error) {
            console.error('Error getting directory listing:', error);
            return {
                path: currentPath,
                items: [],
                canGoUp: false,
                totalItems: 0,
                hiddenItems: 0,
                accessMethod: 'vault'
            };
        }
    }

    /**
     * Toggle file selection (Sushitrain selective sync approach)
     */
    async toggleFileSelection(filePath: string, selected: boolean): Promise<void> {
        try {
            this.settings.syncedFiles[filePath] = selected;
            
            // If selecting a folder, recursively select children (Sushitrain pattern)
            if (selected) {
                for (const [path, item] of this.vaultFiles) {
                    if (path.startsWith(filePath + '/')) {
                        this.settings.syncedFiles[path] = true;
                    }
                }
            } else {
                // If deselecting a folder, deselect children
                for (const [path, item] of this.vaultFiles) {
                    if (path.startsWith(filePath + '/')) {
                        this.settings.syncedFiles[path] = false;
                    }
                }
            }
            
            console.log(`File selection toggled: ${filePath} = ${selected}`);
        } catch (error) {
            console.error('Error toggling file selection:', error);
        }
    }

    /**
     * Get file content (for future streaming support like Sushitrain)
     */
    async getFileContent(filePath: string): Promise<string | null> {
        try {
            const file = this.vault.getAbstractFileByPath(filePath);
            if (file instanceof TFile) {
                return await this.vault.read(file);
            }
            return null;
        } catch (error) {
            console.error(`Error reading file ${filePath}:`, error);
            return null;
        }
    }

    /**
     * Cleanup and disconnect file watchers
     */
    destroy(): void {
        console.log('Cleaning up iOS File Manager...');
        this.vault.offref();
        this.vaultFiles.clear();
        this.isInitialized = false;
    }
}
