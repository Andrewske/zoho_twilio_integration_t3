import { flipOptOutIfStale } from './flipOptOutIfStale';

jest.mock('~/actions/zoho/contact/lookupContact', () => ({
  lookupContact: jest.fn(),
}));
jest.mock('~/actions/zoho/contact/updateContact', () => ({
  updateContact: jest.fn(),
}));

import { lookupContact } from '~/actions/zoho/contact/lookupContact';
import { updateContact } from '~/actions/zoho/contact/updateContact';

const phone = '+15125550100';
const lookupStudioId = 'studio_lookup';

beforeEach(() => jest.clearAllMocks());

describe('flipOptOutIfStale', () => {
  it('flips a Lead with SMS_Opt_Out=false, preserving Owner', async () => {
    lookupContact.mockResolvedValue({
      id: 'lead_1',
      isLead: true,
      SMS_Opt_Out: false,
      Owner: { id: 'owner_99' },
    });
    updateContact.mockResolvedValue({ data: [{ code: 'SUCCESS' }] });

    const result = await flipOptOutIfStale({ phone, lookupStudioId });

    expect(result).toEqual({ outcome: 'flipped', contactId: 'lead_1', module: 'Leads' });
    expect(updateContact).toHaveBeenCalledWith({
      studioId: lookupStudioId,
      contactId: 'lead_1',
      module: 'Leads',
      data: { data: [{ Owner: { id: 'owner_99' }, SMS_Opt_Out: true }] },
    });
  });

  it('uses Contacts module when isLead=false', async () => {
    lookupContact.mockResolvedValue({
      id: 'ct_2',
      isLead: false,
      SMS_Opt_Out: false,
      Owner: { id: 'owner_x' },
    });
    updateContact.mockResolvedValue({ data: [{ code: 'SUCCESS' }] });

    const result = await flipOptOutIfStale({ phone, lookupStudioId });

    expect(result.outcome).toBe('flipped');
    expect(result.module).toBe('Contacts');
    expect(updateContact).toHaveBeenCalledWith(expect.objectContaining({ module: 'Contacts' }));
  });

  it('returns already when SMS_Opt_Out is already true (idempotent)', async () => {
    lookupContact.mockResolvedValue({
      id: 'lead_3',
      isLead: true,
      SMS_Opt_Out: true,
      Owner: { id: 'owner_q' },
    });

    const result = await flipOptOutIfStale({ phone, lookupStudioId });

    expect(result).toEqual({ outcome: 'already', contactId: 'lead_3' });
    expect(updateContact).not.toHaveBeenCalled();
  });

  it('returns not_found when lookupContact returns null', async () => {
    lookupContact.mockResolvedValue(null);

    const result = await flipOptOutIfStale({ phone, lookupStudioId });

    expect(result).toEqual({ outcome: 'not_found' });
    expect(updateContact).not.toHaveBeenCalled();
  });

  it('returns lookup_error when lookupContact throws', async () => {
    lookupContact.mockRejectedValue(new Error('zoho 500'));

    const result = await flipOptOutIfStale({ phone, lookupStudioId });

    expect(result).toEqual({ outcome: 'lookup_error' });
    expect(updateContact).not.toHaveBeenCalled();
  });

  it('returns update_error when updateContact returns undefined (catches own errors)', async () => {
    lookupContact.mockResolvedValue({
      id: 'lead_4',
      isLead: true,
      SMS_Opt_Out: false,
      Owner: { id: 'owner_y' },
    });
    updateContact.mockResolvedValue(undefined);

    const result = await flipOptOutIfStale({ phone, lookupStudioId });

    expect(result).toEqual({ outcome: 'update_error', contactId: 'lead_4' });
  });

  it('returns update_error when updateContact throws', async () => {
    lookupContact.mockResolvedValue({
      id: 'lead_5',
      isLead: true,
      SMS_Opt_Out: false,
      Owner: { id: 'owner_z' },
    });
    updateContact.mockRejectedValue(new Error('boom'));

    const result = await flipOptOutIfStale({ phone, lookupStudioId });

    expect(result).toEqual({ outcome: 'update_error', contactId: 'lead_5' });
  });
});
