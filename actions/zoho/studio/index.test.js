import { getStudioFromZohoId } from './index';
import { getStudioFromZohoId as helperGetStudioFromZohoId } from '~/utils/studio-lookups';

jest.mock('~/utils/studio-lookups', () => ({
    getStudioFromZohoId: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

describe('getStudioFromZohoId (action wrapper)', () => {
    it('delegates to the studio-lookups helper and returns its value', async () => {
        const studioData = { id: 1, name: 'Studio' };
        helperGetStudioFromZohoId.mockResolvedValue(studioData);

        const result = await getStudioFromZohoId('zohoId');

        expect(helperGetStudioFromZohoId).toHaveBeenCalledWith('zohoId');
        expect(result).toEqual(studioData);
    });

    it('passes null through from the helper', async () => {
        helperGetStudioFromZohoId.mockResolvedValue(null);
        const result = await getStudioFromZohoId('zohoId');
        expect(result).toBeNull();
    });
});
