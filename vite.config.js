import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createHash } from 'crypto'
import { execSync, execFileSync } from 'child_process'

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

const toAbsolutePath = (filePath) => (
  path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
);

const isReadableFile = (filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return stats.isFile();
  } catch (e) {
    return false;
  }
};

const resolveTlsFiles = (env) => {
  const envCertPath = env.VITE_TLS_CERT_PATH || env.TLS_CERT_PATH;
  const envKeyPath = env.VITE_TLS_KEY_PATH || env.TLS_KEY_PATH;
  const envCaPath = env.VITE_TLS_CA_PATH || env.TLS_CA_PATH;

  if (envCertPath || envKeyPath) {
    if (!envCertPath || !envKeyPath) {
      throw new Error('Both VITE_TLS_CERT_PATH and VITE_TLS_KEY_PATH (or TLS_CERT_PATH and TLS_KEY_PATH) must be set together.');
    }

    const certPath = toAbsolutePath(envCertPath);
    const keyPath = toAbsolutePath(envKeyPath);
    if (!isReadableFile(certPath)) {
      throw new Error(`VITE_TLS_CERT_PATH does not exist or is not readable: ${certPath}`);
    }
    if (!isReadableFile(keyPath)) {
      throw new Error(`VITE_TLS_KEY_PATH does not exist or is not readable: ${keyPath}`);
    }

    let caPath = null;
    if (envCaPath) {
      caPath = toAbsolutePath(envCaPath);
      if (!isReadableFile(caPath)) {
        throw new Error(`VITE_TLS_CA_PATH does not exist or is not readable: ${caPath}`);
      }
    }

    return { certPath, keyPath, caPath, source: 'env-paths' };
  }

  const certPath = path.resolve(process.cwd(), 'server.crt');
  const keyPath = path.resolve(process.cwd(), 'server.key');
  if (!isReadableFile(certPath) || !isReadableFile(keyPath)) {
    throw new Error(`Missing TLS files for Vite HTTPS. Expected ${certPath} and ${keyPath}, or set VITE_TLS_CERT_PATH/VITE_TLS_KEY_PATH (or TLS_CERT_PATH/TLS_KEY_PATH).`);
  }

  let caPath = null;
  if (envCaPath) {
    caPath = toAbsolutePath(envCaPath);
    if (!isReadableFile(caPath)) {
      throw new Error(`VITE_TLS_CA_PATH does not exist or is not readable: ${caPath}`);
    }
  }

  return { certPath, keyPath, caPath, source: 'default' };
};

const SECURITY_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss: ws: https://*.ingest.sentry.io",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ');

const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'autoplay=()',
  'camera=()',
  'display-capture=()',
  'fullscreen=(self)',
  'geolocation=()',
  'gyroscope=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'payment=()',
  'publickey-credentials-get=(self)',
  'serial=()',
  'usb=()',
].join(', ');

const setSecurityHeaders = (req, res) => {
  res.setHeader('Content-Security-Policy', SECURITY_CSP);
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
  if (req.socket && req.socket.encrypted) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
};

// Read TLS certificate info
const getCertInfo = (certPath) => {
  try {
    const subject = execFileSync('openssl', ['x509', '-noout', '-subject', '-in', certPath], { encoding: 'utf8' }).trim().replace('subject=', '');
    const issuer = execFileSync('openssl', ['x509', '-noout', '-issuer', '-in', certPath], { encoding: 'utf8' }).trim().replace('issuer=', '');
    const dates = execFileSync('openssl', ['x509', '-noout', '-dates', '-in', certPath], { encoding: 'utf8' }).trim();
    const fingerprint = execFileSync('openssl', ['x509', '-noout', '-fingerprint', '-sha256', '-in', certPath], { encoding: 'utf8' }).trim().replace('sha256 Fingerprint=', '').replace('SHA256 Fingerprint=', '');

    const validFrom = dates.match(/notBefore=(.+)/)?.[1] || '';
    const validTo = dates.match(/notAfter=(.+)/)?.[1] || '';

    return { subject, issuer, validFrom, validTo, fingerprint };
  } catch (e) {
    console.warn('Could not read certificate info:', e.message);
    return null;
  }
};

export default defineConfig(({ mode }) => {
  // Load env file from current directory
  const env = loadEnv(mode, process.cwd(), '');
  const port = parseInt(env.VITE_DEV_PORT) || 5173;
  let tlsFiles;
  try {
    tlsFiles = resolveTlsFiles(env);
  } catch (e) {
    throw new Error(`[TLS] ${e.message}`);
  }
  const cachedCertInfo = JSON.stringify(getCertInfo(tlsFiles.certPath));
  const certInfoEtag = `W/"${Buffer.byteLength(cachedCertInfo)}-${createHash('sha256').update(cachedCertInfo).digest('base64url').slice(0, 27)}"`;
  const certInfoLastModified = (() => {
    try {
      return fs.statSync(tlsFiles.certPath).mtime.toUTCString();
    } catch (e) {
      return null;
    }
  })();

  console.log(`[TLS] Vite HTTPS certificate: ${tlsFiles.certPath}`);
  console.log(`[TLS] Vite HTTPS private key: ${tlsFiles.keyPath}`);
  if (tlsFiles.caPath) {
    console.log(`[TLS] Vite HTTPS CA bundle: ${tlsFiles.caPath}`);
  }
  console.log(`[TLS] Vite TLS source: ${tlsFiles.source}`);

  return {
    plugins: [
      vue(),
      {
        name: 'configure-response-headers',
        configureServer: (server) => {
          server.middlewares.use((req, res, next) => {
            setSecurityHeaders(req, res);
            next();
          });

          // API endpoint for certificate info (cached)
          server.middlewares.use((req, res, next) => {
            if (req.url === '/api/cert-info') {
              const ifNoneMatch = req.headers['if-none-match'];
              if (typeof ifNoneMatch === 'string' && ifNoneMatch.split(',').map(v => v.trim()).includes(certInfoEtag)) {
                res.statusCode = 304;
                res.end();
                return;
              }
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Cache-Control', 'public, max-age=86400');
              res.setHeader('ETag', certInfoEtag);
              if (certInfoLastModified) {
                res.setHeader('Last-Modified', certInfoLastModified);
              }
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
        key: fs.readFileSync(tlsFiles.keyPath),
        cert: fs.readFileSync(tlsFiles.certPath),
        ...(tlsFiles.caPath ? { ca: fs.readFileSync(tlsFiles.caPath) } : {}),
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
        // Auth endpoints
        '/api/auth': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
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
