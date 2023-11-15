import React from 'react';
import { render, screen } from '@testing-library/react';
import { format } from 'date-fns';
import Message from './index'; // Adjust the import path as necessary
describe('Message', () => {
    it('renders the message body correctly', () => {
        const mockMessage = {
            body: 'Test message',
            from: 'Sender',
            date: '2021-01-01T12:00:00.000Z',
            fromStudio: false
        };

        render(<Message message={mockMessage} />);
        expect(screen.getByText('Test message')).toBeInTheDocument();
    });

    it('displays sender information correctly', () => {
        const mockMessage = {
            body: 'Test message',
            from: 'Sender',
            date: '2021-01-01T12:00:00.000Z',
            fromStudio: false
        };

        render(<Message message={mockMessage} />);
        expect(screen.getByText('Sender')).toBeInTheDocument();
    });

    it('formats the date correctly', () => {
        const mockMessage = {
            body: 'Test message',
            from: 'Sender',
            date: '2021-01-01T12:00:00.000Z',
            fromStudio: false
        };

        // Format the date in the local time zone for the assertion
        const formattedDate = format(new Date(mockMessage.date), 'yyyy-MM-dd:HH:mm');

        render(<Message message={mockMessage} />);
        expect(screen.getByText(formattedDate)).toBeInTheDocument();
    });

    it('applies correct styling when the message is from the studio', () => {
        const mockMessage = {
            body: 'Test message',
            from: 'Sender',
            date: '2021-01-01T12:00:00.000Z',
            fromStudio: true
        };

        const { container } = render(<Message message={mockMessage} />);
        expect(container.querySelector('.to')).toBeInTheDocument();
    });

    // Add more tests for different scenarios as needed
});