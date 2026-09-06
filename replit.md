# Convite RSVP Premium

Sistema premium de convites personalizados para celebrações, com RSVP, painel do organizador e check-in no evento.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/convite-rsvp` — React/Vite invitation and organizer application.
- `artifacts/api-server/src/routes/rsvp.ts` — RSVP, invites, dashboard, messages, and check-in API.
- `lib/api-spec/openapi.yaml` — source of truth for API contracts.
- `lib/db/src/schema/event.ts` — Drizzle schema for event content, invitations, messages, and check-ins.

## Architecture decisions

- Public invitation pages use secure invitation tokens; organizer routes are protected with Clerk.
- Event content is seeded in PostgreSQL so the preview is usable immediately and can later be edited from settings.
- The public invitation and organizer workspace intentionally share the same event data and API contracts.

## Product

Guests receive a personalized invitation, explore the couple's story, confirm or decline attendance, add participants, and leave a message. Organizers can review attendance, manage invite links, moderate messages, and check guests in.

## User preferences

The requested visual direction is premium, romantic, emotional, sophisticated, and mobile-friendly rather than a generic template.

## Gotchas

- Regenerate the API client after changing `lib/api-spec/openapi.yaml`.
- Organizer data endpoints require a Clerk session; public event/invitation response endpoints remain open.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
