# SMS Project Memory Bank

## Project Overview
Next.js application integrating Zoho CRM with Twilio SMS messaging. Functions as a Zoho extension for sending/receiving SMS with leads from CRM interface.

## Key Components
- **Database**: Prisma + PostgreSQL
- **API**: Twilio webhooks, Zoho CRM integration, cron jobs
- **Frontend**: Embedded Zoho extension with ChatWindow interface
- **Authentication**: OAuth tokens with automatic refresh

## Important Files
- `app/api/twilio/webhook/route.js` - Main SMS webhook entry point
- `actions/zoho/` - Zoho CRM operations
- `components/ChatWindow.jsx` - Main SMS interface
- `prisma/schema.prisma` - Database models
- `utils/prisma.js` - Database client

## Development
- Run: `pnpm dev` (HTTPS required)
- Build: `pnpm build`
- Test: `pnpm test`
- Lint: `pnpm lint`

## Integration Flow
1. Inbound: Twilio → Contact lookup → Storage → Task/Follow-up
2. Outbound: ChatWindow → sendMessage → Twilio → Database