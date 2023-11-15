import { getZohoRecord, getCurrentUser } from './index';

describe('getZohoRecord', () => {
    it('should call ZOHO.CRM.API.getRecord with the correct parameters', () => {
        const entity = 'TestEntity';
        const entityId = 'TestId';
        global.ZOHO = {
            CRM: {
                API: {
                    getRecord: jest.fn(),
                },
            },
        };

        getZohoRecord(entity, entityId);

        expect(global.ZOHO.CRM.API.getRecord).toHaveBeenCalledWith({
            Entity: entity,
            RecordID: entityId,
        });
    });
});


describe('getCurrentUser', () => {
    it('should return the current user', () => {
        const mockUser = { name: 'John Doe', email: 'johndoe@example.com' };
        global.ZOHO = {
            CRM: {
                CONFIG: {
                    getCurrentUser: jest.fn(() => mockUser),
                },
            },
        };
        const user = getCurrentUser();
        expect(user).toEqual(mockUser);
        expect(global.ZOHO.CRM.CONFIG.getCurrentUser).toHaveBeenCalled();
    });
});