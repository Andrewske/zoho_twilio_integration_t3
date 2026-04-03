import React from 'react';
import { render, screen } from '@testing-library/react';
import MessageList from './index';

const defaultProps = {
    messages: [],
    contactName: 'Test Contact',
    selectedSender: { label: 'Studio', phone: '5551234567' },
    setSelectedSender: jest.fn(),
    availableSenders: [],
    setSmsPhone: jest.fn(),
};

describe('MessageList', () => {
    window.HTMLElement.prototype.scrollTo = jest.fn();

    it('renders a list of messages', () => {
        const mockMessages = [
            { body: 'Message 1', from: 'Sender 1', date: '2021-01-01T12:00:00.000Z', fromStudio: true, studioName: 'Test_Studio' },
            { body: 'Message 2', from: 'Sender 2', date: '2021-01-02T13:00:00.000Z', fromStudio: false },
        ];

        render(<MessageList {...defaultProps} messages={mockMessages} />);
        expect(screen.getByText('Message 1')).toBeInTheDocument();
        expect(screen.getByText('Message 2')).toBeInTheDocument();
    });

    it('scrolls when new messages are added', () => {
        const { rerender } = render(<MessageList {...defaultProps} messages={[]} />);

        const newMessages = [
            { body: 'Message 1', from: 'Sender 1', date: '2021-01-01T12:00:00.000Z', fromStudio: true, studioName: 'Test_Studio' },
        ];
        rerender(<MessageList {...defaultProps} messages={newMessages} />);

        // scrollTo is called via useEffect when messages change
        expect(window.HTMLElement.prototype.scrollTo).toHaveBeenCalled();
    });

    it('renders an empty wrapper when the message list is empty', () => {
        const { container, queryAllByTestId } = render(<MessageList {...defaultProps} messages={[]} />);

        expect(container.firstChild).toHaveClass('wrapper');
        const messages = queryAllByTestId('message');
        expect(messages.length).toBe(0);
    });
});
