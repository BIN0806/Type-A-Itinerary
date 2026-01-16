#!/usr/bin/env node
/**
 * Get local IP address for API configuration
 * Run: node scripts/get-local-ip.js
 */

const os = require('os');

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  
  return 'localhost';
}

const ip = getLocalIP();
console.log('\n📡 Local IP Address for Mobile Development:');
console.log(`   ${ip}`);
console.log('\n💡 Update mobile/src/services/api.ts:');
console.log(`   const API_BASE_URL = 'http://${ip}:8000/v1'`);
console.log('\n⚠️  Make sure Docker is running and backend is at http://${ip}:8000\n');

process.exit(0);
