
import { fetchAndSetStudioData } from './index'; // Adjust the import path as necessary
import { getStudioData } from '~/actions/zoho/studio';


import { getCurrentUser } from '~/utils/zohoApi';
import { sendError, sendSuccess } from '~/utils/toast';

jest.mock('~/utils/zohoApi', () => ({
    getCurrentUser: jest.fn(),
}));


jest.mock('~/utils/toast', () => ({
    sendError: jest.fn(),
    sendSuccess: jest.fn(),
}))

jest.mock('~/actions/zoho/studio', () => ({
    getStudioData: jest.fn(),
}))


describe('fetchAndSetStudioData', () => {
    const setStudio = jest.fn();

    let consoleError;

    beforeEach(() => {
        jest.clearAllMocks();
        consoleError = console.error;
        console.error = jest.fn();
    });

    afterEach(() => {
        console.error = consoleError;
    });


    it('should fetch and set studio data when user exists', async () => {
        const user = { id: '123' };
        const studio = { name: 'Test Studio' };


        getCurrentUser.mockResolvedValue({ users: [user] });
        getStudioData.mockResolvedValue(studio);

        await fetchAndSetStudioData({ setStudio, sendSuccess, sendError });

        expect(getCurrentUser).toHaveBeenCalledTimes(1);
        expect(getStudioData).toHaveBeenCalledWith({ zohoId: user.id });
        expect(sendSuccess).toHaveBeenCalledWith(`Zoho user: ${studio.name}`);
        expect(setStudio).toHaveBeenCalledWith(studio);
        expect(sendError).not.toHaveBeenCalled();
    });

    it('should send error when user does not exist', async () => {
        getCurrentUser.mockResolvedValue({ users: [] });

        await fetchAndSetStudioData({ setStudio, sendSuccess, sendError });

        expect(getCurrentUser).toHaveBeenCalledTimes(1);
        expect(sendError).toHaveBeenCalledWith('Cannot locate your Zoho user. Try refreshing the page');
        expect(setStudio).not.toHaveBeenCalled();
        expect(sendSuccess).not.toHaveBeenCalled();
    });

    it('should send error when an error occurs', async () => {
        getCurrentUser.mockRejectedValue(new Error('Test error'));

        await fetchAndSetStudioData({ setStudio, sendSuccess, sendError });

        expect(getCurrentUser).toHaveBeenCalledTimes(1);
        expect(sendError).toHaveBeenCalledWith('An error occurred while fetching the studio data. Please try again.');
        expect(setStudio).not.toHaveBeenCalled();
        expect(sendSuccess).not.toHaveBeenCalled();
    });
});