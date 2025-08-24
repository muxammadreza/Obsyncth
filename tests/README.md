# Test Files

This folder contains various test scripts and debugging utilities for the Obsyncth plugin.

## Test Scripts

- **test-asset-selection.js** - Tests asset selection and filtering logic
- **test-config-path.js** - Tests configuration path resolution
- **test-directory-creation.js** - Tests directory creation and permissions
- **test-download.js** - Tests Syncthing binary download functionality
- **test-edge-cases.js** - Tests edge cases and error handling
- **test-executable-finder.js** - Tests executable path detection and validation
- **test-executable.js** - Tests executable functionality and permissions
- **test-http.js** - Tests HTTP communication with Syncthing API
- **test-monitor.js** - Tests status monitoring and event handling
- **test-startup-sequence.js** - Tests plugin startup sequence and initialization

## Debug Utilities

- **debug-executable.js** - Debug utility for executable path resolution and platform detection

## Running Tests

Currently, tests are standalone Node.js scripts. Run them individually:

```bash
node tests/test-executable.js
node tests/test-monitor.js
# etc.
```

## Future Improvements

Consider integrating a proper test framework like Jest or Mocha for:
- Structured test organization
- Test reporting and coverage
- Automated test running in CI/CD
- Mock and stub capabilities for Obsidian API testing
