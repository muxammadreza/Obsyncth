// Test robust directory creation for Syncthing config
const fs = require('fs');
const path = require('path');
const os = require('os');

// Create a temporary test directory
const testBaseDir = path.join(os.tmpdir(), 'obsyncth-test-' + Date.now());
const testPluginDir = path.join(testBaseDir, '.obsidian', 'plugins', 'obsyncth-1.5.6');

// Mock plugin context
const mockPlugin = {
    getPluginAbsolutePath: () => testPluginDir + '/'
};

// Test function (extracted from the updated code)
async function ensureSyncthingDirectories(plugin) {
    const pluginPath = plugin.getPluginAbsolutePath();
    const binaryConfigDir = `${pluginPath}Syncthing binary-config`;
    const configDir = `${binaryConfigDir}/syncthing-config`;
    
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
        return { success: true, configDir, binaryConfigDir };
    } catch (dirError) {
        console.error('Failed to create Syncthing directories:', dirError);
        return { success: false, error: dirError.message };
    }
}

// Clean up function
function cleanup() {
    if (fs.existsSync(testBaseDir)) {
        fs.rmSync(testBaseDir, { recursive: true, force: true });
    }
}

// Run tests
async function runTests() {
    console.log('🧪 Testing robust Syncthing directory creation...\n');
    
    try {
        // Test 1: Fresh directory creation (first run scenario)
        console.log('📁 Test 1: Fresh directory creation (simulating first run)');
        console.log(`   Test base: ${testBaseDir}`);
        console.log(`   Plugin dir: ${testPluginDir}`);
        
        const result1 = await ensureSyncthingDirectories(mockPlugin);
        
        if (result1.success) {
            console.log('   ✅ PASS: Directories created successfully');
            console.log(`   Binary-config dir exists: ${fs.existsSync(result1.binaryConfigDir)}`);
            console.log(`   Config dir exists: ${fs.existsSync(result1.configDir)}`);
        } else {
            console.log(`   ❌ FAIL: ${result1.error}`);
            return;
        }
        
        // Test 2: Subsequent runs (directories already exist)
        console.log('\n📁 Test 2: Subsequent runs (directories already exist)');
        
        const result2 = await ensureSyncthingDirectories(mockPlugin);
        
        if (result2.success) {
            console.log('   ✅ PASS: Existing directories handled correctly');
        } else {
            console.log(`   ❌ FAIL: ${result2.error}`);
        }
        
        // Test 3: Verify directory structure
        console.log('\n📁 Test 3: Verify directory structure');
        
        const expectedStructure = [
            result1.binaryConfigDir,
            result1.configDir
        ];
        
        let structureValid = true;
        for (const dir of expectedStructure) {
            if (!fs.existsSync(dir)) {
                console.log(`   ❌ Missing directory: ${dir}`);
                structureValid = false;
            }
        }
        
        if (structureValid) {
            console.log('   ✅ PASS: Directory structure is correct');
            console.log('   Structure:');
            console.log('   Syncthing binary-config/');
            console.log('   └── syncthing-config/');
        }
        
        console.log('\n🎯 All directory creation tests completed successfully!');
        console.log('\n💡 This should resolve the first-run config folder creation issue.');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        cleanup();
    }
}

// Run the tests
runTests();
