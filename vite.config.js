import { defineConfig, loadEnv } from 'vite'
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

export default defineConfig(({ mode }) => {
  // Load env file from current directory
  const env = loadEnv(mode, process.cwd(), '');
  const port = parseInt(env.VITE_DEV_PORT) || 5173;

  return {
    plugins: [
      vue(),
      {
        name: 'configure-response-headers',
        configureServer: (server) => {
          server.middlewares.use((req, res, next) => {
            // REQUIRED for Wiregasm/SharedArrayBuffer
            res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
            res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

            // Aggressive caching for large WASM files (1 year)
            // These files are versioned, so long cache is safe
            if (req.url?.match(/\.(wasm|bmp|data)$/)) {
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            }

            next();
          });
        }
      }
    ],
    server: {
      host, // Bind to default gateway interface only
      port,
      https: {
        key: fs.readFileSync('./server.key'),
        cert: fs.readFileSync('./server.crt'),
      },
      // This fixes the "WebSocket connection failed" HMR error in your screenshot
      hmr: {
        clientPort: port
      }
    }
  };
})
