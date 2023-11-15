import { render } from '@testing-library/react';
import { ZohoProvider } from './index';
import { fetchAndSetLeadPhoneNumber } from './fetchAndSetLeadPhoneNumber';
import { fetchAndSetStudioData } from './fetchAndSetStudioData';

jest.mock('./fetchAndSetLeadPhoneNumber', () => ({
    fetchAndSetLeadPhoneNumber: jest.fn(),
}))

jest.mock('./fetchAndSetStudioData', () => ({
    fetchAndSetStudioData: jest.fn(),
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

    it('should set lead phone number and studio data on page load', async () => {

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

        await expect(fetchAndSetLeadPhoneNumber).toHaveBeenCalledWith({
            entity: mockData.Entity,
            entityId: mockData.EntityId,
            setLeadPhoneNumber: expect.any(Function),
        });
        await expect(fetchAndSetStudioData).toHaveBeenCalledWith({
            setStudio: expect.any(Function),
        });
    });
});