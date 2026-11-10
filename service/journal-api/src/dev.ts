// Dev entry point: a test scaffold so a dev-client build on a phone can reach this API without a
// real Firebase App Check token. Never deployed; Docker and Cloud Run still run src/server.ts.
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { createServer } from './app.ts';
import { createGemini, GEMINI_MODEL } from './gemini.ts';

const MIN_DEV_TOKEN_CHARS = 32;

// Constant-time compare, so a timing side channel cannot recover the token byte by byte. Lengths
// are compared first because timingSafeEqual throws when they differ.
export function devTokenMatches(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function start(): void {
  const apiKey = process.env.GEMINI_API_KEY;
  const devAppToken = process.env.DEV_APP_TOKEN;
  if (!apiKey || !devAppToken) {
    const missing = [!apiKey && 'GEMINI_API_KEY', !devAppToken && 'DEV_APP_TOKEN'].filter(Boolean);
    console.error(JSON.stringify({ code: 'missing_configuration', missing }));
    process.exit(1);
  }

  if (devAppToken.length < MIN_DEV_TOKEN_CHARS) {
    console.error(JSON.stringify({ code: 'dev_token_too_short' }));
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production') {
    console.error(JSON.stringify({ code: 'production_refused' }));
    process.exit(1);
  }

  const gemini = new GoogleGenAI({ apiKey });
  const server = createServer({
    verifyAppCheck: async (token) => {
      if (!devTokenMatches(token, devAppToken)) throw new Error('app_check_invalid');
    },
    generate: createGemini(gemini, {
      model: process.env.DEV_GEMINI_MODEL?.trim() || GEMINI_MODEL,
    }),
    log: (entry) => console.log(JSON.stringify(entry)),
    requestId: randomUUID,
    now: Date.now,
  });

  process.on('SIGTERM', () => server.close(() => process.exit(0)));

  const port = Number(process.env.PORT ?? 8080);
  server.listen(port, () =>
    console.log(JSON.stringify({ code: 'listening', port, devAppCheck: true })),
  );
}

// Guarded so tests can import devTokenMatches without starting a server.
if (import.meta.main) start();
