import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import {db} from './server/db.ts';
import {createApiRouter} from './server/routes.ts';

const PORT = Number(process.env.PORT || 3000);
const DIST_DIR = path.resolve(process.cwd(), 'dist');
const IS_PROD =
  process.env.NODE_ENV === 'production' || fs.existsSync(path.join(DIST_DIR, 'index.html'));

async function startServer(): Promise<void> {
  await db.init();

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({limit: '4mb'}));

  app.use('/api', createApiRouter());

  if (!IS_PROD) {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = DIST_DIR;
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output missing. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[VeriFace] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[VeriFace] Fatal startup error:', err);
  process.exit(1);
});
