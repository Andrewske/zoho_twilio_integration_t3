jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() } }));
jest.mock('~/utils/logError', () => ({ logError: jest.fn() }));

import axios from 'axios';
import { logError } from '~/utils/logError';
import { uploadMessagesToZoho, ORG_ID } from './index';

const rows = [{ sid: 'SM1', from: '+1', to: '+2', body: 'hi', status: 'sent', date: '2026-04-02 00:00:00', direction: 'outbound-api' }];

describe('uploadMessagesToZoho', () => {
    beforeEach(() => jest.clearAllMocks());

    it('posts multipart without Content-Type or getHeaders (the Next 16 crash)', async () => {
        axios.post.mockResolvedValue({ data: { status: 'success' } });

        const result = await uploadMessagesToZoho(rows, { accessToken: 'tok' });

        expect(result).toEqual({ status: 'success' });
        expect(axios.post).toHaveBeenCalledTimes(1);

        const [url, body, opts] = axios.post.mock.calls[0];
        expect(url).toContain('analyticsapi.zoho.com');
        expect(body).toBeInstanceOf(FormData);
        // Regression: native FormData has no getHeaders, and axios must derive the
        // multipart boundary itself — so Content-Type must be absent.
        expect(body.getHeaders).toBeUndefined();
        expect(opts.headers['Content-Type']).toBeUndefined();
        expect(opts.headers.Authorization).toBe('Bearer tok');
        expect(opts.headers['ZANALYTICS-ORGID']).toBe(ORG_ID);
    });

    it('skips the POST on empty input', async () => {
        const result = await uploadMessagesToZoho([], { accessToken: 'tok' });
        expect(result).toEqual({ skipped: true, count: 0 });
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('awaits the post and throws on failure (no fire-and-forget)', async () => {
        const boom = new Error('zoho 400');
        boom.response = { data: { error: 'bad' } };
        axios.post.mockRejectedValue(boom);

        await expect(uploadMessagesToZoho(rows, { accessToken: 'tok' })).rejects.toThrow('zoho 400');
        expect(logError).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Error uploading to Zoho', error: boom })
        );
    });
});
