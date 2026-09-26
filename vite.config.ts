import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// /admin and /admin/* get admin.html (the "Shah's Orders" app's own head); the
// rest get index.html. vercel.json does this on the live site; this does it for
// `npm run dev` and `npm run preview`. /admin.webmanifest is a file, not a page.
const ADMIN_PAGE = /^\/admin(\/[^?#]*)?([?#].*)?$/;
const adminPage = (): Plugin => {
  const rewrite: Connect.NextHandleFunction = (req, _res, next) => {
    if (req.url && ADMIN_PAGE.test(req.url)) req.url = '/admin.html';
    next();
  };
  return {
    name: 'admin-page',
    configureServer: (server) => { server.middlewares.use(rewrite); },
    configurePreviewServer: (server) => { server.middlewares.use(rewrite); },
  };
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), adminPage()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      // Both pages load the same entry (src/main.tsx); only their heads differ.
      input: {
        index: path.resolve(__dirname, 'index.html'),
        admin: path.resolve(__dirname, 'admin.html'),
      },
    },
  },
  server: {
    host: true,
    port: 3000,
    strictPort: true,
    open: true,
  },
});
