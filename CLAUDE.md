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

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health