import { render } from '@testing-library/react';
import { ZohoProvider } from './index';
import { fetchAndSetContact } from './fetchAndSetContact';
import { fetchAndSetStudioData } from './fetchAndSetStudioData';

jest.mock('./fetchAndSetContact', () => ({
    fetchAndSetContact: jest.fn(),
}))

jest.mock('./fetchAndSetStudioData', () => ({
    fetchAndSetStudioData: jest.fn(),
}))

jest.mock('~/utils/toast', () => ({
    sendSuccess: jest.fn(),
}))

describe('ZohoProvider', () => {
    it('should render children', () => {
        const { getByText } = render(
            <ZohoProvider>
                <div>Test</div>
            </ZohoProvider>
        );
        expect(getByText('Test')).toBeInTheDocument();
    });

    it('should set contact and studio data on page load', async () => {
        const mockData = { Entity: 'TestEntity', EntityId: 'TestId' };
        const mockZoho = {
            embeddedApp: {
                on: jest.fn((event, callback) => {
                    if (event === 'PageLoad') {
                        callback(mockData);
                    }
                }),
                init: jest.fn(),
            },
        };
        global.ZOHO = mockZoho;

        render(
            <ZohoProvider>
                <div>Test</div>
            </ZohoProvider>
        );

        await expect(fetchAndSetContact).toHaveBeenCalledWith({
            entity: mockData.Entity,
            entityId: mockData.EntityId,
            setContact: expect.any(Function),
        });
        await expect(fetchAndSetStudioData).toHaveBeenCalledWith({
            setStudio: expect.any(Function),
        });
    });
});
