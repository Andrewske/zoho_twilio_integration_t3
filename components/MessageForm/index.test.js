import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MessageForm from './index';
import { sendMessage } from '~/actions/messages/sendMessage';
import { getMessages } from '~/actions/messages';
import * as Sentry from '@sentry/react';
import { sendSuccess, sendError } from '~/utils/toast';

jest.mock('~/actions/messages/sendMessage', () => ({
  sendMessage: jest.fn(),
}));
jest.mock('~/actions/messages', () => ({
  getMessages: jest.fn(),
}));
jest.mock('~/actions/zoho/studio', () => ({
  getStudioFromZohoId: jest.fn(),
}));
jest.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: jest.fn() }),
}));
jest.mock('@sentry/react', () => ({
  captureException: jest.fn(),
}));
jest.mock('~/utils/toast', () => ({
  sendSuccess: jest.fn(),
  sendError: jest.fn(),
}));

describe('MessageForm', () => {
  const contact = { id: 'contact1', Mobile: '1234567890' };
  const studio = { id: 'studio1', smsPhone: '0987654321' };
  const selectedSender = { label: 'Studio', phone: '0987654321' };

  const defaultProps = {
    contact,
    studio,
    setMessages: jest.fn(),
    smsPhone: studio.smsPhone,
    selectedSender,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getMessages.mockResolvedValue([]);
  });

  it('renders correctly', () => {
    render(<MessageForm {...defaultProps} />);
    expect(screen.getByPlaceholderText('Type your message here...')).toBeInTheDocument();
    expect(screen.getByText('Send')).toBeInTheDocument();
  });

  it('allows typing in the textarea', () => {
    render(<MessageForm {...defaultProps} />);
    const textarea = screen.getByPlaceholderText('Type your message here...');
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    expect(textarea).toHaveValue('Hello');
  });

  it('sends a message when the form is submitted', async () => {
    sendMessage.mockResolvedValueOnce({ success: true, provider: 'twilio' });
    getMessages.mockResolvedValueOnce([]);

    render(<MessageForm {...defaultProps} />);
    const textarea = screen.getByPlaceholderText('Type your message here...');

    await act(async () => {
      await userEvent.type(textarea, 'Hello');
      userEvent.click(screen.getByText('Send'));
    });

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Hello',
          to: contact.Mobile,
          from: studio.smsPhone,
        })
      );
    });
  });

  it('handles errors when sending a message', async () => {
    const error = new Error('Failed to send');
    sendMessage.mockRejectedValueOnce(error);

    render(<MessageForm {...defaultProps} />);
    const textarea = screen.getByPlaceholderText('Type your message here...');
    fireEvent.change(textarea, { target: { value: 'Hello' } });

    await act(async () => {
      userEvent.click(screen.getByText('Send'));
    });

    await waitFor(() => {
      expect(sendError).toHaveBeenCalledWith(error.message, false);
    });
  });
});
