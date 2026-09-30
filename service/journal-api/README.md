# Journal API

Stateless Cloud Run service behind the Daytale journal pipeline. It turns transcript segments into a grounded event list and clarification questions, and turns supported events plus answers into a journal entry. The request and response contract, limits, and policy rules are owned by [Journal API and Gemini pipeline](../../Docs/03-SPEC.md#7-journal-api-and-gemini-pipeline); this file only covers running and deploying the service.

The service stores nothing. Request bodies, transcripts, prompts, model output, and tokens are never logged.

## Endpoints

- `POST /v1/journal/analyze` - segments in, `{ events, questions }` out.
- `POST /v1/journal/generate` - events and answers in, `{ title, paragraphs, contextTags }` out.

Both require `Content-Type: application/json`, a body of at most 1 MiB, and a valid Firebase App Check token in the `X-Firebase-AppCheck` header. Every response carries a server-generated `X-Request-Id`. Errors are `{ "error": { "code": "<snake_case>", "requestId": "<id>" } }` and never echo input.

| Status | Code                                      | Cause                                                       |
| ------ | ----------------------------------------- | ----------------------------------------------------------- |
| 400    | `invalid_request`                         | Invalid JSON, schema, or unknown key                        |
| 401    | `app_check_required`, `app_check_invalid` | Missing header, or token verification failed                |
| 404    | `not_found`                               | Unknown path                                                |
| 405    | `method_not_allowed`                      | Known path, method other than `POST`                        |
| 413    | `payload_too_large`                       | Body over 1 MiB                                             |
| 415    | `unsupported_media_type`                  | Content type is not `application/json`                      |
| 429    | `upstream_rate_limited`                   | Gemini returned HTTP 429; `Retry-After` is set              |
| 500    | `internal`                                | Unexpected failure                                          |
| 502    | `model_output_invalid`                    | Model output failed schema or policy after one retry        |
| 503    | `upstream_unavailable`                    | Any other Gemini failure                                    |
| 504    | `upstream_timeout`                        | Gemini call exceeded 60 seconds                             |

## Layout

- `src/contract.ts` - types, strict request parsers, model-output validation and grounding policy, and the JSON Schemas given to Gemini. It has no imports so the mobile app can reuse it to re-validate responses.
- `src/app.ts` - `createServer(deps)`: routing, body limit, App Check, request ids, error mapping, logging. Every external is injected.
- `src/gemini.ts` - the Gemini call (`gemini-3.8-flash`, structured JSON output, medium thinking, no tools).
- `src/server.ts` - production wiring and the only file that reads `process.env`.

Node 22.18 or newer runs the TypeScript sources directly, so there is no build step.

## Run locally

```sh
npm ci --prefix service/journal-api
GEMINI_API_KEY=<key> FIREBASE_PROJECT_ID=<project> npm --prefix service/journal-api start
```

The server listens on `PORT` (default `8080`). It exits at startup, naming only the missing variable, when `GEMINI_API_KEY` or `FIREBASE_PROJECT_ID` is unset. Requests need a real App Check token for `<project>`; without one the service answers `401`.

## Test

```sh
npm --prefix service/journal-api run check
```

This runs `tsc` and then `node --test` over `test/*.test.ts`. Tests start the real server on an ephemeral port and use fakes for App Check, Gemini, and the logger, so they need no network or credentials. The root `npm run check` runs the same command as `check:service`.

## Deploy

```sh
gcloud run deploy journal-api --source service/journal-api --region <region> --allow-unauthenticated --set-secrets GEMINI_API_KEY=gemini-api-key:latest --set-env-vars FIREBASE_PROJECT_ID=<project>
```

Cloud Run IAM is public because Firebase App Check is the gate: mobile clients hold no Google identity. Store the Gemini key in Secret Manager as `gemini-api-key`; it is never placed in source, `.env` files, or the image. App Check token verification uses only the project id and Google's public keys, so the service needs no extra credentials.

## Logs

One JSON line per request on stdout with only these fields:

- `requestId`, `route`, `status`, `durationMs`, `code` (the error code, or `null`).
- Counts where relevant: `segments`, `events`, `questions`, `paragraphs`, `droppedEvents`.

Unexpected errors are logged by code only. Request content, model output, tokens, headers, and upstream error messages never reach the logs.

## Known limits

The grounding check rejects invented Latin capitalized names and English feeling words. It does not detect Devanagari names or Nepali feelings, so Nepali text passes through the check untouched. Upgrading it means a second model pass or entity extraction.
