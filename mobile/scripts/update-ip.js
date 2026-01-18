#!/usr/bin/env node
/**
 * Automatically updates the API base URL in api.ts with the current local IP.
 * Run this when you switch WiFi networks: npm run update-ip
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Get current local IP
function getLocalIP() {
    try {
        const ip = execSync('ipconfig getifaddr en0', { encoding: 'utf8' }).trim();
        if (!ip) throw new Error('No IP found');
        return ip;
    } catch {
        try {
            // Fallback for different interface
            return execSync('ipconfig getifaddr en1', { encoding: 'utf8' }).trim();
        } catch {
            console.error('❌ Could not detect local IP address');
            process.exit(1);
        }
    }
}

// Update api.ts with new IP
function updateApiFile(ip) {
    const apiFilePath = path.join(__dirname, '../src/services/api.ts');

    if (!fs.existsSync(apiFilePath)) {
        console.error('❌ api.ts not found at:', apiFilePath);
        process.exit(1);
    }

    let content = fs.readFileSync(apiFilePath, 'utf8');

    // Match the IP in the API_BASE_URL line
    const ipRegex = /http:\/\/[\d.]+:8000\/v1/;
    const newUrl = `http://${ip}:8000/v1`;

    if (!ipRegex.test(content)) {
        console.error('❌ Could not find IP pattern in api.ts');
        process.exit(1);
    }

    const oldMatch = content.match(ipRegex)[0];

    if (oldMatch === newUrl) {
        console.log('✅ IP is already up to date:', ip);
        return;
    }

    content = content.replace(ipRegex, newUrl);
    fs.writeFileSync(apiFilePath, content, 'utf8');

    console.log('');
    console.log('✅ Updated API base URL!');
    console.log(`   Old: ${oldMatch}`);
    console.log(`   New: ${newUrl}`);
    console.log('');
    console.log('💡 Restart Metro bundler: npm start');
    console.log('');
}

// Main
const ip = getLocalIP();
console.log('🔍 Detected local IP:', ip);
updateApiFile(ip);
