import axios from 'axios';
import { logError } from '~/utils/logError';

// Zoho Analytics workspace/view/org for the Twilio message log. Single source
// of truth — imported by the daily cron (app/api/twilio/get_messages) and the
// one-off backfill script (scripts/backfill-zoho-analytics.mjs).
export const WORKSPACE_ID = '2511121000000015263';
export const VIEW_ID = '2511121000004625031';
export const ORG_ID = '770600067';

const IMPORT_URL = `https://analyticsapi.zoho.com/restapi/v2/workspaces/${WORKSPACE_ID}/views/${VIEW_ID}/data`;

// updateadd + matchingColumns:['sid'] makes every import idempotent — re-sending
// the same message rows updates in place instead of duplicating.
const IMPORT_CONFIG = {
    importType: 'updateadd',
    fileType: 'json',
    autoIdentify: 'true',
    onError: 'abort',
    matchingColumns: ['sid'],
};

/**
 * Upload Twilio message rows to the Zoho Analytics view.
 *
 * Uses native FormData; axios v1 derives the multipart boundary from it, so we
 * must NOT set Content-Type and must NOT call formData.getHeaders() — that method
 * exists only on the `form-data` npm package, not native FormData, and calling it
 * is what silently broke this pipeline after the Next 16 upgrade.
 *
 * @param {Array<Object>} messages - rows shaped {sid, from, to, body, status, date, direction}
 * @param {Object} params
 * @param {string} params.accessToken - Zoho OAuth access token
 * @returns {Promise<Object>} Zoho response body
 * @throws on a failed import so callers surface a real error (no fire-and-forget)
 */
export const uploadMessagesToZoho = async (messages, { accessToken }) => {
    if (!messages?.length) return { skipped: true, count: 0 };

    const formData = new FormData();
    formData.append('DATA', JSON.stringify(messages));
    formData.append('CONFIG', JSON.stringify(IMPORT_CONFIG));

    try {
        const res = await axios.post(IMPORT_URL, formData, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'oauthscope': 'ZohoAnalytics.data.create',
                'ZANALYTICS-ORGID': ORG_ID,
            },
        });
        return res.data;
    } catch (error) {
        const detail = error.response?.data ?? error.message;
        console.error('Error importing data to Zoho:', detail);
        await logError({ message: 'Error uploading to Zoho', error, level: 'error' });
        throw error;
    }
};
