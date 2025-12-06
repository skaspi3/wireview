import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs'
import os from 'os'

// Get the IP address of the interface connected to default gateway
const getDefaultGatewayIP = () => {
  try {
    // Parse /proc/net/route to find default gateway interface (Linux only)
    const routes = fs.readFileSync('/proc/net/route', 'utf8');
    const lines = routes.trim().split('\n').slice(1); // Skip header

    for (const line of lines) {
      const parts = line.split('\t');
      const dest = parts[1];
      const iface = parts[0];

      // Default route has destination 00000000
      if (dest === '00000000') {
        // Get IP of this interface
        const interfaces = os.networkInterfaces();
        const ifaceAddrs = interfaces[iface];
        if (ifaceAddrs) {
          const ipv4 = ifaceAddrs.find(a => a.family === 'IPv4' && !a.internal);
          if (ipv4) {
            console.log(`Vite binding to ${iface} (${ipv4.address}) - default gateway interface`);
            return ipv4.address;
          }
        }
      }
    }
  } catch (e) {
    console.warn('Could not detect default gateway interface:', e.message);
  }
  return '0.0.0.0'; // Fallback
};

const host = getDefaultGatewayIP();

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'configure-response-headers',
      configureServer: (server) => {
        server.middlewares.use((_req, res, next) => {
          // REQUIRED for Wiregasm/SharedArrayBuffer
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          next();
        });
      }
    }
  ],
  server: {
    host, // Bind to default gateway interface only
    port: 5173,
    https: {
      key: fs.readFileSync('./server.key'),
      cert: fs.readFileSync('./server.crt'),
    },
    // This fixes the "WebSocket connection failed" HMR error in your screenshot
    hmr: {
      clientPort: 5173 
    }
  }
})
