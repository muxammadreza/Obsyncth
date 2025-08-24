#!/bin/bash

# Obsyncth Release Script
# Automated release management for Obsyncth plugin (BRAT compatible)
# Copyright (c) 2024-2025 Reza Mir

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Obsyncth BRAT-Compatible Release Script${NC}"

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Not in a git repository${NC}"
    exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo -e "${RED}❌ Error: You have uncommitted changes. Please commit or stash them first.${NC}"
    exit 1
fi

# Check if gh CLI is available
if ! command -v gh &> /dev/null; then
    echo -e "${YELLOW}⚠️  Warning: GitHub CLI (gh) not found. Release will be created without GitHub release.${NC}"
    echo -e "${BLUE}💡 Install GitHub CLI: https://cli.github.com/manual/installation${NC}"
    GH_AVAILABLE=false
else
    GH_AVAILABLE=true
fi

# Get the version to release
if [ -z "$1" ]; then
    echo -e "${YELLOW}📝 Please provide a version number:${NC}"
    echo -e "${BLUE}   Examples: 1.2.5, patch, minor, major${NC}"
    read -p "Version: " VERSION
else
    VERSION=$1
fi

echo -e "${GREEN}🔄 Setting version to: $VERSION${NC}"

# Update package.json version and run version-bump script
npm version $VERSION --no-git-tag-version

# Build the plugin
echo -e "${GREEN}🔨 Building plugin for BRAT compatibility...${NC}"
npm run build

# Check if build was successful and all required files exist
echo -e "${GREEN}✅ Validating BRAT-required files...${NC}"
MISSING_FILES=""

if [ ! -f "main.js" ]; then
    MISSING_FILES="$MISSING_FILES main.js"
fi

if [ ! -f "manifest.json" ]; then
    MISSING_FILES="$MISSING_FILES manifest.json"
fi

if [ ! -f "styles.css" ]; then
    echo -e "${YELLOW}⚠️  Warning: styles.css not found. Creating empty file for BRAT compatibility.${NC}"
    touch styles.css
fi

if [ ! -z "$MISSING_FILES" ]; then
    echo -e "${RED}❌ Build failed: Required files missing:$MISSING_FILES${NC}"
    exit 1
fi

echo -e "${GREEN}✅ All BRAT-required files present: main.js, manifest.json, styles.css${NC}"

# Get the actual version from package.json
ACTUAL_VERSION=$(node -p "require('./package.json').version")

echo -e "${GREEN}✅ Version synchronized across all files: $ACTUAL_VERSION${NC}"

# Add all changed files
git add .

# Commit the changes
echo -e "${GREEN}📝 Committing version $ACTUAL_VERSION...${NC}"
git commit -m "🔖 Release v$ACTUAL_VERSION

- Updated version in package.json, manifest.json, and versions.json
- Built plugin files for BRAT compatibility
- Ready for release

📦 BRAT Installation:
Add repository: muxammadreza/Obsyncth"

# Create and push the tag (this will trigger the GitHub Actions release workflow)
echo -e "${GREEN}🏷️  Creating and pushing tag v$ACTUAL_VERSION...${NC}"
git tag "v$ACTUAL_VERSION"

# Push to main first (this may trigger auto-release workflow)
echo -e "${GREEN}📤 Pushing to main branch...${NC}"
git push origin main

# Push the tag (this will trigger the tag-based release workflow)
echo -e "${GREEN}📤 Pushing tag v$ACTUAL_VERSION...${NC}"
git push origin "v$ACTUAL_VERSION"

if [ "$GH_AVAILABLE" = true ]; then
    echo -e "${BLUE}⏳ Waiting for GitHub Actions to create the release...${NC}"
    echo -e "${YELLOW}� The release will be created automatically by GitHub Actions.${NC}"
    echo -e "${BLUE}🔗 Check the release at: https://github.com/muxammadreza/Obsyncth/releases/tag/v$ACTUAL_VERSION${NC}"
else
    echo -e "${YELLOW}⚠️  Manual GitHub release creation may be needed.${NC}"
fi

echo -e "${GREEN}🎉 Release v$ACTUAL_VERSION process completed!${NC}"
echo -e "${BLUE}📦 BRAT-compatible files: main.js, manifest.json, styles.css${NC}"
echo -e "${BLUE}🧪 BRAT Installation: Add repository 'muxammadreza/Obsyncth'${NC}"
echo -e "${BLUE}📱 Cross-platform support: Desktop (auto-binary) + Mobile (remote)${NC}"

# Show next steps
echo -e "\n${YELLOW}� Next Steps:${NC}"
echo -e "${BLUE}1. Monitor GitHub Actions for release creation${NC}"
echo -e "${BLUE}2. Test the release with BRAT installation${NC}"
echo -e "${BLUE}3. Update documentation if needed${NC}"
echo -e "${BLUE}4. Announce the release to users${NC}"
