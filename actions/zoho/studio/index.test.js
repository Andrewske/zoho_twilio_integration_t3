import { getStudioFromZohoId } from './index';

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
