import { findAdminStudioByPhone, getStudioFromPhoneNumber, getStudioFromZohoId } from './index';

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

describe('getStudioFromZohoId', () => {
    it('returns the studio data if it exists', async () => {
        const studioData = { id: 1, name: 'Studio' };
        prisma.studio.findFirst.mockResolvedValue(studioData);
        const result = await getStudioFromZohoId('zohoId');
        expect(result).toEqual(studioData);
    });

    it('returns null if the studio data does not exist', async () => {
        prisma.studio.findFirst.mockResolvedValue(null);
        const result = await getStudioFromZohoId('zohoId');
        expect(result).toBeNull();
    });
});

describe('getStudioFromPhoneNumber', () => {
    it('prefers a non-admin active studio on the given phone', async () => {
        const physical = { id: 'physical', isAdmin: false, active: true };
        prisma.studio.findFirst.mockResolvedValueOnce(physical);

        const result = await getStudioFromPhoneNumber('5551112222');

        expect(result).toEqual(physical);
        expect(prisma.studio.findFirst).toHaveBeenCalledTimes(1);
        expect(prisma.studio.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ active: true, isAdmin: false }),
            })
        );
    });

    it('falls back to any active studio on the phone when no non-admin match exists', async () => {
        const adminOnly = { id: 'admin', isAdmin: true, active: true };
        prisma.studio.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(adminOnly);

        const result = await getStudioFromPhoneNumber('5551112222');

        expect(result).toEqual(adminOnly);
        expect(prisma.studio.findFirst).toHaveBeenCalledTimes(2);
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
