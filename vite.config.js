import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs'
import os from 'os'
import { execSync } from 'child_process'

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

// Read TLS certificate info
const getCertInfo = () => {
  try {
    const certPath = './server.crt';
    if (!fs.existsSync(certPath)) return null;

    const subject = execSync(`openssl x509 -noout -subject -in "${certPath}"`, { encoding: 'utf8' }).trim().replace('subject=', '');
    const issuer = execSync(`openssl x509 -noout -issuer -in "${certPath}"`, { encoding: 'utf8' }).trim().replace('issuer=', '');
    const dates = execSync(`openssl x509 -noout -dates -in "${certPath}"`, { encoding: 'utf8' }).trim();
    const fingerprint = execSync(`openssl x509 -noout -fingerprint -sha256 -in "${certPath}"`, { encoding: 'utf8' }).trim().replace('sha256 Fingerprint=', '').replace('SHA256 Fingerprint=', '');

    const validFrom = dates.match(/notBefore=(.+)/)?.[1] || '';
    const validTo = dates.match(/notAfter=(.+)/)?.[1] || '';

    return { subject, issuer, validFrom, validTo, fingerprint };
  } catch (e) {
    console.warn('Could not read certificate info:', e.message);
    return null;
  }
};

// Cache cert info at startup (avoids 4x execSync on every request)
const cachedCertInfo = JSON.stringify(getCertInfo());

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
          // API endpoint for certificate info (cached)
          server.middlewares.use((req, res, next) => {
            if (req.url === '/api/cert-info') {
              res.setHeader('Content-Type', 'application/json');
              res.end(cachedCertInfo);
              return;
            }
            next();
          });

          // Note: COOP/COEP headers removed - not needed in thin-client mode (no Wiregasm/WASM)
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
      },
      // Proxy WebSocket and API connections to backend on localhost
      proxy: {
        '/ws': {
          target: 'ws://127.0.0.1:3000',
          ws: true,
          changeOrigin: true
        },
        // Thin-client API endpoints
        '/api/packet': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
        '/api/packets': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
        '/api/files': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
        '/api/packets-batch': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
        '/api/stats': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
        '/api/files-save': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
        '/api/save-pcap': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
        '/api/save-filtered': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
        '/api/interfaces': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        }
      }
    }
  };
})
