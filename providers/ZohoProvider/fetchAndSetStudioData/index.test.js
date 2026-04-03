import { fetchAndSetStudioData } from './index';
import { getStudioFromZohoId } from '~/actions/zoho/studio';
import { getCurrentUser } from '~/utils/zohoApi';
import { sendError, sendSuccess } from '~/utils/toast';

jest.mock('~/utils/zohoApi', () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock('~/utils/toast', () => ({
    sendError: jest.fn(),
    sendSuccess: jest.fn(),
}));

jest.mock('~/actions/zoho/studio', () => ({
    getStudioFromZohoId: jest.fn(),
}));

jest.mock('~/utils/logError', () => ({
    logError: jest.fn(),
}));

describe('fetchAndSetStudioData', () => {
    const setStudio = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should fetch and set studio data when user exists', async () => {
        const user = { id: '123' };
        const studio = { name: 'Test Studio', active: true };

        getCurrentUser.mockResolvedValue({ users: [user] });
        getStudioFromZohoId.mockResolvedValue(studio);

        await fetchAndSetStudioData({ setStudio });

        expect(getCurrentUser).toHaveBeenCalledTimes(1);
        expect(getStudioFromZohoId).toHaveBeenCalledWith(user.id);
        expect(sendSuccess).toHaveBeenCalledWith(`Zoho user: ${studio.name}`);
        expect(setStudio).toHaveBeenCalledWith(studio);
        expect(sendError).not.toHaveBeenCalled();
    });

    it('should send error when user does not exist', async () => {
        getCurrentUser.mockResolvedValue({ users: [] });

        await fetchAndSetStudioData({ setStudio });

        expect(getCurrentUser).toHaveBeenCalledTimes(1);
        expect(sendError).toHaveBeenCalledWith('Cannot locate your Zoho user. Try refreshing the page');
        expect(setStudio).not.toHaveBeenCalled();
        expect(sendSuccess).not.toHaveBeenCalled();
    });

    it('should send error when an error occurs', async () => {
        const error = new Error('Test error');
        // getCurrentUser is called once in try (throws), once in catch block
        getCurrentUser.mockRejectedValueOnce(error).mockResolvedValue({ users: [] });

        await fetchAndSetStudioData({ setStudio });

        expect(sendError).toHaveBeenCalledWith(
            `An error occurred while fetching the studio data: ${error.message}`
        );
        expect(setStudio).not.toHaveBeenCalled();
        expect(sendSuccess).not.toHaveBeenCalled();
    });
});
