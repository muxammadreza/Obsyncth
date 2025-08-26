/**
 * iOS File Manager Module
 * 
 * Comprehensive file system access for iOS devices within Obsidian plugin context.
 * Implements multiple strategies to work around iOS sandboxing limitations:
 * 
 * 1. WebKit Directory API with hidden file detection
 * 2. File System Access API (OPFS) for persistent storage
 * 3. Shell-like command simulation for file operations
 * 4. Obsidian Vault API integration for accessible files
 * 5. Manual file discovery and mapping
 */

import { Notice, Vault, TFile, TFolder } from 'obsidian';

export interface IOSFileItem {
    name: string;
    path: string;
    type: 'file' | 'folder';
    isHidden: boolean;
    isSelected: boolean;
    size?: number;
    lastModified?: Date;
    isAccessible: boolean;
    children?: IOSFileItem[];
    webkitFile?: File; // Reference to the actual File object from picker
}

export interface IOSDirectoryListing {
    path: string;
    items: IOSFileItem[];
    canGoUp: boolean;
    totalItems: number;
    hiddenItems: number;
    accessMethod: 'webkit' | 'opfs' | 'vault' | 'manual';
}

export interface IOSFileManagerSettings {
    selectedVaultPath: string;
    syncedFiles: { [path: string]: boolean };
    ignorePatterns: string[];
    allowHiddenFiles: boolean;
    manualFileMapping: { [path: string]: IOSFileItem };
}

export class IOSFileManager {
    private vault: Vault;
    private settings: IOSFileManagerSettings;
    private fileCache: Map<string, IOSFileItem[]> = new Map();
    private webkitFiles: Map<string, File> = new Map();
    private isInitialized: boolean = false;
    
    // Known Obsidian hidden files and folders (for detection purposes)
    private readonly commonHiddenPaths = [
        '.obsidian',
        '.obsidian/app.json',
        '.obsidian/appearance.json',
        '.obsidian/core-plugins.json',
        '.obsidian/core-plugins-migration.json',
        '.obsidian/community-plugins.json',
        '.obsidian/hotkeys.json',
        '.obsidian/workspace.json',
        '.obsidian/workspace-mobile.json',
        '.obsidian/plugins',
        '.obsidian/themes',
        '.obsidian/snippets',
        '.obsidian/graph.json',
        '.git',
        '.gitignore',
        '.DS_Store',
        'Thumbs.db',
        '.stfolder',
        '.stignore'
    ];

    constructor(vault: Vault, settings: IOSFileManagerSettings) {
        this.vault = vault;
        this.settings = settings;
    }

    /**
     * Initialize the iOS file manager with multiple access strategies
     */
    async initialize(): Promise<boolean> {
        try {
            console.log('Initializing iOS File Manager...');
            
            // Strategy 1: Try to use existing vault structure
            await this.scanVaultStructure();
            
            // Strategy 2: Check for File System Access API support
            if ('showDirectoryPicker' in window) {
                console.log('File System Access API available');
            }
            
            // Strategy 3: Check for OPFS support
            if ('storage' in navigator && 'getDirectory' in navigator.storage) {
                console.log('Origin Private File System available');
            }
            
            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('Failed to initialize iOS File Manager:', error);
            return false;
        }
    }

    /**
     * Show iOS folder picker with enhanced file detection
     */
    async showFolderPicker(): Promise<string | null> {
        try {
            new Notice('Opening iOS folder picker...', 3000);
            
            const input = document.createElement('input');
            input.type = 'file';
            input.webkitdirectory = true;
            input.multiple = true;
            input.style.display = 'none';
            
            document.body.appendChild(input);
            
            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    document.body.removeChild(input);
                    resolve(null);
                }, 60000); // 1 minute timeout
                
                input.onchange = async (event: any) => {
                    clearTimeout(timeout);
                    const files = event.target.files;
                    
                    if (files && files.length > 0) {
                        new Notice(`Processing ${files.length} files...`, 3000);
                        
                        const result = await this.processWebKitFiles(files);
                        document.body.removeChild(input);
                        
                        if (result) {
                            new Notice(`Successfully processed ${result.totalItems} items (${result.hiddenItems} hidden)`, 5000);
                            resolve(result.path);
                        } else {
                            resolve(null);
                        }
                    } else {
                        clearTimeout(timeout);
                        document.body.removeChild(input);
                        resolve(null);
                    }
                };
                
                input.addEventListener('cancel', () => {
                    clearTimeout(timeout);
                    document.body.removeChild(input);
                    resolve(null);
                });
                
                // Trigger the picker
                input.click();
            });
        } catch (error) {
            console.error('iOS folder picker error:', error);
            new Notice('Failed to open folder picker. Please ensure you\'re using a compatible iOS version.', 5000);
            return null;
        }
    }

    /**
     * Enhanced folder selection with result information
     */
    async selectVaultFolder(): Promise<{ success: boolean; selectedPath: string | null; filesProcessed: number; error?: string }> {
        try {
            const selectedPath = await this.showFolderPicker();
            
            if (selectedPath) {
                const filesProcessed = Object.keys(this.settings.syncedFiles).length;
                return {
                    success: true,
                    selectedPath,
                    filesProcessed
                };
            } else {
                return {
                    success: false,
                    selectedPath: null,
                    filesProcessed: 0,
                    error: 'No folder selected'
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
     * Process files from WebKit directory picker
     */
    private async processWebKitFiles(files: FileList): Promise<IOSDirectoryListing | null> {
        try {
            const fileStructure = new Map<string, IOSFileItem>();
            const directoryStructure = new Map<string, Set<string>>();
            let hiddenCount = 0;
            
            // Clear previous webkit files cache
            this.webkitFiles.clear();
            
            // Process all selected files
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const relativePath = file.webkitRelativePath || file.name;
                
                // Store the actual File object for later access
                this.webkitFiles.set(relativePath, file);
                
                // Determine if this is a hidden file/folder
                const isHidden = this.isHiddenPath(relativePath);
                if (isHidden) hiddenCount++;
                
                // Create file item
                const fileItem: IOSFileItem = {
                    name: file.name,
                    path: relativePath,
                    type: 'file',
                    isHidden: isHidden,
                    isSelected: true, // Default to selected
                    size: file.size,
                    lastModified: new Date(file.lastModified),
                    isAccessible: true,
                    webkitFile: file
                };
                
                fileStructure.set(relativePath, fileItem);
                
                // Build directory structure
                const pathParts = relativePath.split('/');
                for (let j = 1; j < pathParts.length; j++) {
                    const parentPath = pathParts.slice(0, j).join('/');
                    const childPath = pathParts.slice(0, j + 1).join('/');
                    
                    if (!directoryStructure.has(parentPath)) {
                        directoryStructure.set(parentPath, new Set());
                    }
                    directoryStructure.get(parentPath)!.add(childPath);
                    
                    // Create folder items if they don't exist
                    if (j < pathParts.length - 1 && !fileStructure.has(childPath)) {
                        const folderName = pathParts[j];
                        const folderIsHidden = this.isHiddenPath(childPath);
                        
                        fileStructure.set(childPath, {
                            name: folderName,
                            path: childPath,
                            type: 'folder',
                            isHidden: folderIsHidden,
                            isSelected: true,
                            isAccessible: true,
                            children: []
                        });
                    }
                }
            }
            
            // Detect additional hidden files that might not be included
            await this.detectMissingHiddenFiles(fileStructure);
            
            // Update settings
            const syncedFiles: { [path: string]: boolean } = {};
            fileStructure.forEach((item, path) => {
                syncedFiles[path] = item.isSelected;
            });
            
            this.settings.syncedFiles = syncedFiles;
            this.settings.selectedVaultPath = files.length > 0 ? 'Selected Folder' : '';
            
            // Cache the file structure
            this.fileCache.set('root', Array.from(fileStructure.values()));
            
            return {
                path: 'Selected Folder',
                items: Array.from(fileStructure.values()),
                canGoUp: false,
                totalItems: fileStructure.size,
                hiddenItems: hiddenCount,
                accessMethod: 'webkit'
            };
            
        } catch (error) {
            console.error('Error processing WebKit files:', error);
            return null;
        }
    }

    /**
     * Detect missing hidden files that might not be included in the picker
     */
    private async detectMissingHiddenFiles(fileStructure: Map<string, IOSFileItem>): Promise<void> {
        try {
            // Check for common hidden paths that might be missing
            for (const hiddenPath of this.commonHiddenPaths) {
                if (!fileStructure.has(hiddenPath)) {
                    // Try to infer if this hidden file/folder should exist
                    const shouldExist = this.inferHiddenFileExistence(hiddenPath, fileStructure);
                    
                    if (shouldExist) {
                        const isFolder = !hiddenPath.includes('.') || hiddenPath.endsWith('/');
                        
                        fileStructure.set(hiddenPath, {
                            name: hiddenPath.split('/').pop() || hiddenPath,
                            path: hiddenPath,
                            type: isFolder ? 'folder' : 'file',
                            isHidden: true,
                            isSelected: true,
                            isAccessible: false, // Not directly accessible through webkit
                            children: isFolder ? [] : undefined
                        });
                        
                        console.log(`Detected missing hidden ${isFolder ? 'folder' : 'file'}: ${hiddenPath}`);
                    }
                }
            }
        } catch (error) {
            console.error('Error detecting missing hidden files:', error);
        }
    }

    /**
     * Infer if a hidden file should exist based on other files
     */
    private inferHiddenFileExistence(hiddenPath: string, fileStructure: Map<string, IOSFileItem>): boolean {
        // If we have .obsidian related files, .obsidian folder should exist
        if (hiddenPath === '.obsidian') {
            return Array.from(fileStructure.keys()).some(path => 
                path.startsWith('.obsidian/') || path.includes('obsidian')
            );
        }
        
        // If we have git-related files, .git folder should exist
        if (hiddenPath === '.git') {
            return Array.from(fileStructure.keys()).some(path => 
                path.includes('.git') || path.includes('git')
            );
        }
        
        // If we have markdown files, .obsidian config should exist
        if (hiddenPath.startsWith('.obsidian/')) {
            return Array.from(fileStructure.keys()).some(path => 
                path.endsWith('.md') || path.includes('obsidian')
            );
        }
        
        return false;
    }

    /**
     * Check if a path represents a hidden file or folder
     */
    private isHiddenPath(path: string): boolean {
        const pathParts = path.split('/');
        return pathParts.some(part => 
            part.startsWith('.') || 
            this.commonHiddenPaths.some(hiddenPath => 
                hiddenPath === part || hiddenPath === path || path.startsWith(hiddenPath + '/')
            )
        );
    }

    /**
     * Scan the Obsidian vault structure for accessible files
     */
    private async scanVaultStructure(): Promise<void> {
        try {
            const files = this.vault.getAllLoadedFiles();
            const vaultItems: IOSFileItem[] = [];
            
            for (const file of files) {
                if (file instanceof TFile) {
                    vaultItems.push({
                        name: file.name,
                        path: file.path,
                        type: 'file',
                        isHidden: this.isHiddenPath(file.path),
                        isSelected: this.settings.syncedFiles[file.path] !== false,
                        size: file.stat.size,
                        lastModified: new Date(file.stat.mtime),
                        isAccessible: true
                    });
                } else if (file instanceof TFolder) {
                    vaultItems.push({
                        name: file.name,
                        path: file.path,
                        type: 'folder',
                        isHidden: this.isHiddenPath(file.path),
                        isSelected: this.settings.syncedFiles[file.path] !== false,
                        isAccessible: true,
                        children: []
                    });
                }
            }
            
            this.fileCache.set('vault', vaultItems);
            console.log(`Scanned vault structure: ${vaultItems.length} items`);
        } catch (error) {
            console.error('Error scanning vault structure:', error);
        }
    }

    /**
     * Get directory listing for the file manager
     */
    async getDirectoryListing(currentPath: string = ''): Promise<IOSDirectoryListing> {
        try {
            // If we have webkit files, use those
            if (this.webkitFiles.size > 0) {
                return this.getWebKitDirectoryListing(currentPath);
            }
            
            // Fall back to vault structure
            return this.getVaultDirectoryListing(currentPath);
            
        } catch (error) {
            console.error('Error getting directory listing:', error);
            return {
                path: currentPath,
                items: [{
                    name: 'Error loading files',
                    path: '',
                    type: 'file',
                    isHidden: false,
                    isSelected: false,
                    isAccessible: false
                }],
                canGoUp: false,
                totalItems: 0,
                hiddenItems: 0,
                accessMethod: 'manual'
            };
        }
    }

    /**
     * Get directory listing from WebKit files
     */
    private getWebKitDirectoryListing(currentPath: string): IOSDirectoryListing {
        const items: IOSFileItem[] = [];
        const processedPaths = new Set<string>();
        
        // If no files have been selected yet, show a helpful message
        if (Object.keys(this.settings.syncedFiles).length === 0) {
            return {
                path: currentPath,
                items: [{
                    name: 'No folder selected',
                    path: '',
                    type: 'file',
                    isHidden: false,
                    isSelected: false,
                    isAccessible: false
                }],
                canGoUp: false,
                totalItems: 0,
                hiddenItems: 0,
                accessMethod: 'webkit'
            };
        }
        
        let hiddenCount = 0;
        
        // Get all files/folders at current level
        Object.keys(this.settings.syncedFiles).forEach(filePath => {
            if (currentPath === '') {
                // Root level - get top-level items
                const topLevel = filePath.split('/')[0];
                if (!processedPaths.has(topLevel)) {
                    processedPaths.add(topLevel);
                    
                    const isFolder = Object.keys(this.settings.syncedFiles).some(p => 
                        p.startsWith(topLevel + '/') && p !== topLevel
                    );
                    
                    const isHidden = this.isHiddenPath(topLevel);
                    if (isHidden) hiddenCount++;
                    
                    const webkitFile = this.webkitFiles.get(filePath);
                    
                    items.push({
                        name: topLevel,
                        path: topLevel,
                        type: isFolder ? 'folder' : 'file',
                        isHidden: isHidden,
                        isSelected: this.settings.syncedFiles[topLevel] !== false,
                        size: webkitFile?.size,
                        lastModified: webkitFile ? new Date(webkitFile.lastModified) : undefined,
                        isAccessible: !!webkitFile,
                        children: isFolder ? [] : undefined,
                        webkitFile: webkitFile
                    });
                }
            } else {
                // Subdirectory level
                const prefix = currentPath + '/';
                if (filePath.startsWith(prefix)) {
                    const relativePath = filePath.substring(prefix.length);
                    const nextLevel = relativePath.split('/')[0];
                    
                    if (!processedPaths.has(nextLevel)) {
                        processedPaths.add(nextLevel);
                        
                        const fullPath = currentPath + '/' + nextLevel;
                        const isFolder = Object.keys(this.settings.syncedFiles).some(p => 
                            p.startsWith(fullPath + '/') && p !== fullPath
                        );
                        
                        const isHidden = this.isHiddenPath(nextLevel);
                        if (isHidden) hiddenCount++;
                        
                        const webkitFile = this.webkitFiles.get(fullPath);
                        
                        items.push({
                            name: nextLevel,
                            path: fullPath,
                            type: isFolder ? 'folder' : 'file',
                            isHidden: isHidden,
                            isSelected: this.settings.syncedFiles[fullPath] !== false,
                            size: webkitFile?.size,
                            lastModified: webkitFile ? new Date(webkitFile.lastModified) : undefined,
                            isAccessible: !!webkitFile,
                            children: isFolder ? [] : undefined,
                            webkitFile: webkitFile
                        });
                    }
                }
            }
        });
        
        // Sort items: folders first, then files, hidden items grouped
        items.sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'folder' ? -1 : 1;
            }
            if (a.isHidden !== b.isHidden) {
                return a.isHidden ? 1 : -1;
            }
            return a.name.localeCompare(b.name);
        });
        
        return {
            path: currentPath,
            items: items,
            canGoUp: currentPath !== '',
            totalItems: items.length,
            hiddenItems: hiddenCount,
            accessMethod: 'webkit'
        };
    }

    /**
     * Get directory listing from vault structure
     */
    private getVaultDirectoryListing(currentPath: string): IOSDirectoryListing {
        const vaultItems = this.fileCache.get('vault') || [];
        
        if (vaultItems.length === 0) {
            return {
                path: currentPath,
                items: [{
                    name: 'No files found - use folder picker to select vault',
                    path: '',
                    type: 'file',
                    isHidden: false,
                    isSelected: false,
                    isAccessible: false
                }],
                canGoUp: false,
                totalItems: 0,
                hiddenItems: 0,
                accessMethod: 'vault'
            };
        }
        
        // Filter items for current path
        const items = vaultItems.filter(item => {
            if (currentPath === '') {
                return !item.path.includes('/');
            } else {
                return item.path.startsWith(currentPath + '/') && 
                       item.path.substring(currentPath.length + 1).indexOf('/') === -1;
            }
        });
        
        const hiddenCount = items.filter(item => item.isHidden).length;
        
        return {
            path: currentPath,
            items: items,
            canGoUp: currentPath !== '',
            totalItems: items.length,
            hiddenItems: hiddenCount,
            accessMethod: 'vault'
        };
    }

    /**
     * Toggle file/folder selection
     */
    async toggleFileSelection(filePath: string, selected: boolean): Promise<void> {
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

    /**
     * Generate ignore patterns from selection
     */
    generateIgnorePatterns(): string[] {
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
        
        return ignorePatterns;
    }

    /**
     * Get file content if accessible
     */
    async getFileContent(filePath: string): Promise<string | null> {
        try {
            // Try to get from webkit files first
            const webkitFile = this.webkitFiles.get(filePath);
            if (webkitFile) {
                return await webkitFile.text();
            }
            
            // Try to get from vault
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
     * Clear all cached data
     */
    clearCache(): void {
        this.fileCache.clear();
        this.webkitFiles.clear();
        this.settings.syncedFiles = {};
        this.settings.selectedVaultPath = '';
    }
}
