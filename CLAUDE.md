# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js application that integrates Zoho CRM with Twilio SMS messaging. It functions as a Zoho extension that allows users to send and receive SMS messages with leads directly from the CRM interface.

## Development Commands

```bash
# Development server with HTTPS
pnpm dev

# Build the application (includes Prisma generation)
pnpm build

# Start production server
pnpm start

# Run linting
pnpm lint

# Run tests in watch mode
pnpm test

# Generate Prisma client
npx prisma generate

# Database migrations
npx prisma migrate dev
```

## Core Architecture

### Database Layer (Prisma + PostgreSQL)
- **Prisma schema**: `prisma/schema.prisma` defines the data models
- **Key models**: Account, Studio, StudioAccount, Message, TwilioMessage, ZohoWebhook, TokenRefresh
- **Database client**: `utils/prisma.js` exports the Prisma client instance

### API Layer
- **Twilio webhook**: `app/api/twilio/webhook/route.js` - Main entry point for incoming SMS messages
- **Cron jobs**: Scheduled tasks defined in `vercel.json` for message processing and token refresh
- **Zoho API integration**: `actions/zoho/` contains all Zoho CRM operations

### Frontend Layer
- **Zoho Extension**: Runs as an embedded app within Zoho CRM
- **Context providers**: ZohoProvider manages CRM state, PostHogProvider for analytics
- **Main component**: ChatWindow displays SMS conversation interface

### Integration Flow
1. **Inbound SMS**: Twilio webhook → Contact lookup → Message storage → Task creation or follow-up
2. **Outbound SMS**: ChatWindow → sendMessage action → Twilio API → Database storage
3. **Authentication**: OAuth tokens managed per studio with automatic refresh

### Key Directories
- `actions/`: Server actions for API integrations (Zoho, Twilio)
- `components/`: React components (ChatWindow, MessageForm, MessageList)
- `providers/`: Context providers for state management
- `utils/`: Shared utilities (error logging, mobile formatting, database client)

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
- Twilio credentials stored per account in database
- Zoho OAuth tokens managed automatically

### Testing
- Jest configuration in `jest.config.mjs`
- Test files use `.test.js` extension
- Mocks for external APIs (Twilio, Zoho) available

### Deployment
- Configured for Vercel deployment
- Includes cron job scheduling for automated tasks
- HTTPS required for Zoho extension compatibility