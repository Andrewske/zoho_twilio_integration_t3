jest.mock('~/utils/postHogServer', () => ({ captureServerException: jest.fn() }));
jest.mock('posthog-js', () => ({ __esModule: true, default: { __loaded: false, captureException: jest.fn() } }));

import posthog from 'posthog-js';
import { captureServerException } from '~/utils/postHogServer';
import { logError } from './index';

describe('logError environment routing', () => {
    let savedWindow;

    beforeEach(() => {
        jest.clearAllMocks();
        savedWindow = global.window;
    });
    afterEach(() => {
        global.window = savedWindow;
    });

    it('routes to the posthog-node sink on the server (no window)', async () => {
        // jsdom provides window by default; simulate a server context.
        delete global.window;
        const error = new Error('server boom');

        await logError({ message: 'server failure', error, level: 'error', data: { a: 1 } });

        expect(captureServerException).toHaveBeenCalledWith(
            error,
            null,
            expect.objectContaining({ level: 'error', message: 'server failure', extra_data: expect.any(String) })
        );
        expect(posthog.captureException).not.toHaveBeenCalled();
    });

    it('routes to posthog-js on the client once loaded', async () => {
        posthog.__loaded = true;
        const error = new Error('client boom');

        await logError({ message: 'client failure', error, level: 'error' });

        expect(posthog.captureException).toHaveBeenCalledWith(error, expect.objectContaining({ message: 'client failure' }));
        expect(captureServerException).not.toHaveBeenCalled();
    });

    it('no-ops on invalid params (missing error)', async () => {
        await logError({ message: 'no error object' });
        expect(captureServerException).not.toHaveBeenCalled();
        expect(posthog.captureException).not.toHaveBeenCalled();
    });
});
