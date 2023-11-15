import { isAccessTokenExpired } from './index';

describe('isAccessTokenExpired', () => {
    it('returns true if the access token is expired', () => {
        const account = { updatedAt: new Date(), expiresIn: -1 };
        expect(isAccessTokenExpired(account)).toBe(true);
    });

    it('returns false if the access token is not expired', () => {
        const account = { updatedAt: new Date(), expiresIn: 3600 };
        expect(isAccessTokenExpired(account)).toBe(false);
    });
});