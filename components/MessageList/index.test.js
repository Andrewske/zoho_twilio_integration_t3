import React from 'react';
import { render, screen } from '@testing-library/react';
import MessageList from './index'; // Adjust the import path as necessary

describe('MessageList', () => {
    // Mock the scrollIntoView function
    const mockScrollIntoView = jest.fn();
    window.HTMLElement.prototype.scrollIntoView = mockScrollIntoView;

    it('renders a list of messages', () => {
        const mockMessages = [
            { body: 'Message 1', from: 'Sender 1', date: '2021-01-01T12:00:00.000Z', fromStudio: true },
            { body: 'Message 2', from: 'Sender 2', date: '2021-01-02T13:00:00.000Z', fromStudio: false }
        ];

        render(<MessageList messages={mockMessages} />);
        expect(screen.getByText('Message 1')).toBeInTheDocument();
        expect(screen.getByText('Message 2')).toBeInTheDocument();
    });

    it('scrolls to the bottom when new messages are added', () => {
        const initialMessages = [];

        const { rerender } = render(<MessageList messages={initialMessages} />);

        // Reset the mock to ignore any calls made during the initial render
        mockScrollIntoView.mockReset();

        // Add a new message and rerender
        const newMessages = [{ body: 'Message 1', from: 'Sender 1', date: '2021-01-01T12:00:00.000Z', fromStudio: true }];
        rerender(<MessageList messages={newMessages} />);

        expect(mockScrollIntoView).toHaveBeenCalled();
    });

    it('renders an empty wrapper when the message list is empty', () => {
        const { container, queryAllByTestId } = render(<MessageList messages={[]} />);

        // Check that the container has the wrapper
        expect(container.firstChild).toHaveClass('wrapper');

        // Check that there are no Message components rendered
        const messages = queryAllByTestId('message');
        expect(messages.length).toBe(0);
    });

});