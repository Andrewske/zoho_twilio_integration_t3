import { findAdminStudioByPhone, getStudioFromPhoneNumber } from './studioLookup';

jest.mock('~/utils/prisma.js', () => ({
    prisma: {
        studio: {
            findFirst: jest.fn(),
        },
    },
}));

jest.mock('~/utils/prismaSelectors.js', () => ({
    PrismaSelectors: {
        studio: { full: {} },
    },
}));

import { prisma } from '~/utils/prisma.js';

beforeEach(() => jest.clearAllMocks());

describe('getStudioFromPhoneNumber', () => {
    it('queries active studios on the phone, ordering non-admin first', async () => {
        const physical = { id: 'physical', isAdmin: false, active: true };
        prisma.studio.findFirst.mockResolvedValueOnce(physical);

        const result = await getStudioFromPhoneNumber('5551112222');

        expect(result).toEqual(physical);
        expect(prisma.studio.findFirst).toHaveBeenCalledTimes(1);
        expect(prisma.studio.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ active: true }),
                orderBy: { isAdmin: 'asc' },
            })
        );
    });

    it('returns admin studio when no non-admin match exists (fallback via orderBy)', async () => {
        const adminOnly = { id: 'admin', isAdmin: true, active: true };
        prisma.studio.findFirst.mockResolvedValueOnce(adminOnly);

        const result = await getStudioFromPhoneNumber('5551112222');

        expect(result).toEqual(adminOnly);
        expect(prisma.studio.findFirst).toHaveBeenCalledTimes(1);
    });
});

describe('findAdminStudioByPhone', () => {
    it('returns the admin studio when one is attached to the phone', async () => {
        const adminStudio = { id: 'admin', isAdmin: true, active: true };
        prisma.studio.findFirst.mockResolvedValue(adminStudio);

        const result = await findAdminStudioByPhone('5551112222');

        expect(result).toEqual(adminStudio);
        expect(prisma.studio.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ isAdmin: true, active: true }),
            })
        );
    });

    it('returns null when no admin studio is attached', async () => {
        prisma.studio.findFirst.mockResolvedValue(null);
        const result = await findAdminStudioByPhone('5551112222');
        expect(result).toBeNull();
    });
});
