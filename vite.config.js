import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function lyricsDevPlugin() {
  return {
    name: 'lyrics-dev-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        if (parsedUrl.pathname === '/.netlify/functions/lyrics' || parsedUrl.pathname === '/api/lyrics') {
          try {
            const { handler } = await import('./netlify/functions/lyrics.js');
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
              const queryParams = Object.fromEntries(parsedUrl.searchParams.entries());
              const result = await handler({
                httpMethod: req.method,
                queryStringParameters: queryParams,
                body: body || null,
              });
              res.writeHead(result.statusCode || 200, result.headers || { 'Content-Type': 'application/json' });
              res.end(result.body);
            });
            return;
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), lyricsDevPlugin()],
  build: {
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
      mangle: {
        toplevel: true,
      },
      format: {
        comments: false,
      },
    },
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[hash].js',
        chunkFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash].[ext]',
      },
    },
  },
  css: {
    devSourcemap: false,
    lightningcss: {
      errorRecovery: true,
    },
  },
})

