# Audit Script Error Handling Improvements

## Changes Made

### 1. Enhanced JSON Parsing Error Handling
**File**: `scripts/audit/zohoTimeline.js` - `searchZohoModule` function

**Before**:
```javascript
const data = await response.json(); // Could throw "Unexpected end of JSON input"
```

**After**:
```javascript
const text = await response.text();
if (!text || text.trim().length === 0) {
  return null;
}
try {
  data = JSON.parse(text);
} catch (e) {
  throw new Error(`Invalid JSON response from Zoho: ${e.message} (body length: ${text.length})`);
}
```

### 2. Better HTTP Error Handling
**Added detailed error messages for all non-OK responses**:

```javascript
if (!response.ok) {
  if (response.status === 204) return null; // No content
  if (response.status === 429) { /* rate limit */ }
  
  // Extract error details from response
  const contentType = response.headers.get('content-type');
  let errorMessage = `HTTP ${response.status} ${response.statusText}`;
  
  if (contentType?.includes('application/json')) {
    const errorBody = await response.json();
    errorMessage += ` - ${errorBody.message || errorBody.code}`;
  }
  
  throw new Error(errorMessage);
}
```

### 3. Zoho API Error Code Handling
**Added handling for Zoho-specific error codes in successful responses**:

```javascript
if (data.code === 'NO_DATA' || data.code === 'INVALID_DATA') {
  return null;
}
```

### 4. Enhanced Error Context
**Added context wrapping for better debugging**:

```javascript
catch (error) {
  const contextError = new Error(
    `Zoho ${zohoModule} search failed for ${formatMobile(mobile)}: ${error.message}`
  );
  contextError.originalError = error;
  throw contextError;
}
```

### 5. Error Type Classification
**Added intelligent error categorization in `lookupAndFetchTimeline`**:

```javascript
const errorType = error.status === 429 ? 'Rate limit exceeded' :
                 errorMessage.includes('401') ? 'Authentication failed (token expired)' :
                 errorMessage.includes('403') ? 'Access forbidden' :
                 errorMessage.includes('Invalid JSON') ? 'Invalid API response' :
                 errorMessage;
```

### 6. Module-Level Error Recovery
**Added try-catch in `lookupContactStandalone` to continue searching if one module fails**:

```javascript
for (const module of ['Leads', 'Contacts']) {
  try {
    const contact = await searchZohoModule(...);
    if (contact) return contact;
  } catch (error) {
    // If auth/rate limit error, propagate immediately
    if (error.status === 429 || error.message?.includes('401')) {
      throw error;
    }
    // For other errors, try next module
    console.warn(`Warning: Error searching ${module}: ${error.message}`);
  }
}
```

## Results

### Before Improvements
- **Error message**: "Unexpected end of JSON input" (unhelpful)
- **Root cause**: Hidden - could be empty response, invalid JSON, or auth failure
- **Debugging**: Very difficult

### After Improvements
- **Error messages**: 
  - "Contact not found in Zoho" (clear, expected)
  - "Authentication failed (token expired)" (actionable)
  - "HTTP 401 - invalid oauth token" (specific)
  - "Invalid JSON response from Zoho: Unexpected token..." (detailed)
- **Root cause**: Immediately visible
- **Debugging**: Much easier with original error context

## Test Results (Jan 31 - Feb 1, 2026)

**29 contacts processed**:
- ✅ 17 contacts found successfully
- ⚠️ 6 "Authentication failed (token expired)" - Southlake credentials expired
- ⚠️ 6 "Contact not found in Zoho" - Genuinely missing contacts
- ✅ 0 "Unexpected end of JSON input" errors

## Impact

1. **Developer Experience**: Errors now provide actionable information
2. **Operational**: Can quickly identify if tokens need refreshing vs. contacts are missing
3. **Reliability**: Empty responses and malformed JSON are handled gracefully
4. **Debugging**: Original error context preserved for investigation

## Next Steps

1. **Token Management**: Implement automatic token refresh when 401 errors detected
2. **Retry Logic**: Add exponential backoff for transient failures
3. **Monitoring**: Log error types for trending and alerting
