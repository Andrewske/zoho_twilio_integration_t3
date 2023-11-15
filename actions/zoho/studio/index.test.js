import { getStudioData } from './index';
import prisma from '~/utils/prisma.js';

jest.mock('~/utils/prisma.js', () => ({
    studio: {
        findFirst: jest.fn(),
    },
}));

describe('getStudioData', () => {
    it('returns the studio data if it exists', async () => {
        const studioData = { id: 1, name: 'Studio' };
        prisma.studio.findFirst.mockResolvedValue(studioData);
        const result = await getStudioData({ zohoId: 'zohoId' });
        expect(result).toEqual(studioData);
    });

    it('returns null if the studio data does not exist', async () => {
        prisma.studio.findFirst.mockResolvedValue(null);
        const result = await getStudioData({ zohoId: 'zohoId' });
        expect(result).toBeNull();
    });
});