/**
 * @jest-environment node
 */

jest.mock('server-only', () => ({}));

const ctorMock = jest.fn();

jest.mock('../prisma/generated/prisma/client/client.ts', () => ({
    PrismaClient: function MockPrisma(args) {
        ctorMock(args);
        this.args = args;
    },
}));

jest.mock('@prisma/adapter-pg', () => ({
    PrismaPg: function MockPg(args) {
        this.args = args;
    },
}));

beforeEach(() => {
    delete globalThis.__prisma;
    ctorMock.mockClear();
    jest.resetModules();
});

describe('utils/prisma singleton', () => {
    it('reuses the same PrismaClient instance across imports', async () => {
        const first = (await import('./prisma.js')).prisma;
        const second = (await import('./prisma.js')).prisma;

        expect(first).toBe(second);
        expect(ctorMock).toHaveBeenCalledTimes(1);
    });

    it('caches via globalThis so chunked module loads share the instance', async () => {
        const first = (await import('./prisma.js')).prisma;

        jest.resetModules();
        const second = (await import('./prisma.js')).prisma;

        expect(second).toBe(first);
        expect(ctorMock).toHaveBeenCalledTimes(1);
    });
});
