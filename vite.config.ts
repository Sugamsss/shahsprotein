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

// The admin's build id: the commit on Vercel, else unique per local build. It's
// baked into the admin chunk (__ADMIN_BUILD__, admin code only) and written to
// /admin-release.json, which vercel.json serves no-store. An open admin fetches
// that file and reloads itself at a safe moment when the two differ
// (src/admin/update/appUpdate.ts).
const ADMIN_BUILD = process.env.VERCEL_GIT_COMMIT_SHA || `local-${Date.now().toString(36)}`;
const adminRelease = (): Plugin => ({
  name: 'admin-release',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'admin-release.json', source: `${JSON.stringify({ build: ADMIN_BUILD })}\n` });
  },
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), adminPage(), adminRelease()],
  define: {
    __ADMIN_BUILD__: JSON.stringify(ADMIN_BUILD),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      // Each page has its own entry (index.html -> main.tsx, admin.html -> adminMain.tsx).
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
