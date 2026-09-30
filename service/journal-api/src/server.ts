// Production wiring. The only file that reads process.env.
import { randomUUID } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { initializeApp } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { createServer } from './app.ts';
import { createGemini } from './gemini.ts';

// GEMINI_API_KEY comes from Secret Manager (Cloud Run --set-secrets); FIREBASE_PROJECT_ID is the
// Firebase project whose App Check tokens are accepted. Only variable names are ever printed.
const apiKey = process.env.GEMINI_API_KEY;
const projectId = process.env.FIREBASE_PROJECT_ID;
if (!apiKey || !projectId) {
  const missing = [!apiKey && 'GEMINI_API_KEY', !projectId && 'FIREBASE_PROJECT_ID'].filter(
    Boolean,
  );
  console.error(JSON.stringify({ code: 'missing_configuration', missing }));
  process.exit(1);
}

const appCheck = getAppCheck(initializeApp({ projectId }));
const gemini = new GoogleGenAI({ apiKey });

const server = createServer({
  verifyAppCheck: async (token) => {
    await appCheck.verifyToken(token);
  },
  generate: createGemini(gemini),
  log: (entry) => console.log(JSON.stringify(entry)),
  requestId: randomUUID,
  now: Date.now,
});

for (const event of ['uncaughtException', 'unhandledRejection']) {
  process.on(event, () => {
    console.error(JSON.stringify({ code: event }));
    process.exit(1);
  });
}
process.on('SIGTERM', () => server.close(() => process.exit(0)));

const port = Number(process.env.PORT ?? 8080);
server.listen(port, () => console.log(JSON.stringify({ code: 'listening', port })));
