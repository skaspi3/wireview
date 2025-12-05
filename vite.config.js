import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs'

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
    host: '10.11.0.38', // Listen on all IPs
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
