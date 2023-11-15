import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MessageForm from './index';
import { sendMessage, getMessages } from '~/actions/twilio';
import * as Sentry from '@sentry/react';
import { sendSuccess, sendError } from '~/utils/toast';

// Mock the external dependencies
jest.mock('~/actions/twilio', () => ({
    sendMessage: jest.fn(),
    getMessages: jest.fn()
}));
jest.mock('@sentry/react', () => ({
    captureException: jest.fn()
}));
jest.mock('~/utils/toast', () => ({
    sendSuccess: jest.fn(),
    sendError: jest.fn()
}));


describe('MessageForm', () => {

    const leadPhoneNumber = '1234567890';
    const studio = {
        phone: '0987654321',
        id: 'studio1'
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders correctly', () => {
        render(<MessageForm leadPhoneNumber={leadPhoneNumber} studio={studio} />);
        expect(screen.getByPlaceholderText('Type your message here...')).toBeInTheDocument();
        expect(screen.getByText('Send')).toBeInTheDocument();
    });

    it('allows typing in the textarea', () => {
        render(<MessageForm leadPhoneNumber={leadPhoneNumber} studio={studio} />);
        const textarea = screen.getByPlaceholderText('Type your message here...');
        fireEvent.change(textarea, { target: { value: 'Hello' } });
        expect(textarea).toHaveValue('Hello');
    });

    it('sends a message when the form is submitted', async () => {
        sendMessage.mockResolvedValueOnce({}); // Mock a successful response
        render(<MessageForm leadPhoneNumber={leadPhoneNumber} studio={studio} />);
        const textarea = screen.getByPlaceholderText('Type your message here...');


        await act(async () => {
            const sendButton = screen.getByText('Send');
            await userEvent.type(textarea, 'Hello');
            userEvent.click(sendButton);
        });

        await waitFor(() => {
            expect(sendMessage).toHaveBeenCalledWith({
                message: 'Hello',
                to: leadPhoneNumber,
                from: studio.phone,
                studioId: studio.id
            });
        });


        await waitFor(() => {
            expect(getMessages).toHaveBeenCalledWith({ leadPhoneNumber, studioId: studio.id });
            expect(sendSuccess).toHaveBeenCalledWith('Message sent!');
            expect(screen.getByText('Send')).not.toBeDisabled();
        });

    });

    it('handles errors when sending a message', async () => {
        sendMessage.mockRejectedValueOnce(new Error('Failed to send')); // Mock a failed response
        render(<MessageForm leadPhoneNumber={leadPhoneNumber} studio={studio} />);


        await act(async () => {
            const sendButton = screen.getByText('Send');
            userEvent.click(sendButton);
        })

        await waitFor(() => {
            expect(sendError).toHaveBeenCalledWith('Error sending the message! Try refreshing the page.');
            expect(Sentry.captureException).toHaveBeenCalled();
        });
    });
});