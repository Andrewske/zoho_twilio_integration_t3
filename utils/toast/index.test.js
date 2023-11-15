import { sendSuccess, sendError } from './index';
import { toast } from 'react-toastify';

jest.mock('react-toastify', () => ({
    toast: {
        success: jest.fn(),
        error: jest.fn()
    },
}));

describe('sendSuccess', () => {
    it('should call toast.success with default message if no message is provided', () => {
        sendSuccess();
        expect(toast.success).toHaveBeenCalledWith('Message sent!', { autoClose: 3000 });
    });

    it('should call toast.success with provided message', () => {
        const message = 'Test message';
        sendSuccess(message);
        expect(toast.success).toHaveBeenCalledWith(message, { autoClose: 3000 });
    });

    it('should call toast.success with provided autoClose', () => {
        const autoClose = 5000;
        sendSuccess(null, autoClose);
        expect(toast.success).toHaveBeenCalledWith('Message sent!', { autoClose });
    });
});


describe('sendError', () => {
    it('should call toast.error with the correct message and options', () => {
        const message = 'Test error message';
        const autoClose = 5000;
        sendError(message, autoClose);
        expect(toast.error).toHaveBeenCalledWith(message, { autoClose });
    });
});