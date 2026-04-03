import { isAccessTokenExpired } from './index';

describe('isAccessTokenExpired', () => {
    it('returns true if the access token is expired', async () => {
        const account = { updatedAt: new Date(), expiresIn: -1 };
        expect(await isAccessTokenExpired(account)).toBe(true);
    });

    it('returns false if the access token is not expired', async () => {
        const account = { updatedAt: new Date(), expiresIn: 3600 };
        expect(await isAccessTokenExpired(account)).toBe(false);
    });
});