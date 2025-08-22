# AI Learnings - SMS Project

This file contains important learnings about the project structure and common patterns to help with future development.

## Zoho Voice Message Duplication Issue (Resolved)

### Problem
- Messages sent via Zoho Voice were creating multiple database records
- Root cause: Race condition between message creation and API sync
- Symptoms: 2-3 records for single message (one with null zohoMessageId, one with proper ID, sometimes empty message)

### Solution Implemented
1. **Enhanced Deduplication Logic** (`utils/messageDeduplication.js`)
   - Multi-criteria duplicate detection: zohoMessageId, content, phone numbers, timing (±5 min)
   - Centralized utility for consistent deduplication across codebase

2. **Atomic Message Updates** (`actions/messages/sendMessage.js`)
   - Improved logging for debugging
   - Better handling of zohoMessageId assignment

3. **Smart Sync Process** (`actions/zoho/voice/fetchAllMessages.js`)
   - Updates existing messages with missing zohoMessageId instead of creating duplicates
   - Uses enhanced deduplication before creating new records

4. **Cleanup Tools**
   - Script: `scripts/cleanup-duplicate-messages.js`
   - Commands: `pnpm cleanup:duplicates:dry` and `pnpm cleanup:duplicates`

### Key Files and Functions
- **Message Sending**: `actions/messages/sendMessage.js` → `sendViaZohoVoice()`
- **Message Syncing**: `actions/zoho/voice/fetchAllMessages.js` → `fetchAndSaveZohoVoiceMessages()`
- **Deduplication**: `utils/messageDeduplication.js` → `deduplicateZohoVoiceMessages()`
- **UI Message Loading**: `actions/messages/index.js` → `getMessages()`

### Prevention Strategy
- Always check for both zohoMessageId and content matches when syncing
- Use timing proximity checks for race condition scenarios
- Update existing records rather than creating new ones when possible