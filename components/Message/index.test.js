import React from 'react';
import { render, screen } from '@testing-library/react';
import { format } from 'date-fns';
import Message from './index';

describe('Message', () => {
  const mockMessage = {
    to: '5551234567',
    from: '5557654321',
    body: 'Test message',
    date: '2021-01-01T12:00:00.000Z',
    fromStudio: false,
  };

  it('renders the message body correctly', () => {
    render(<Message message={mockMessage} />);
    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('displays sender information correctly', () => {
    render(<Message message={mockMessage} contactName={mockMessage.from} />);
    expect(screen.getByText('5557654321')).toBeInTheDocument();
  });

  it('formats the date correctly', () => {
    const formattedDate = format(new Date(mockMessage.date), 'MMM do h:mm aaa');
    render(<Message message={mockMessage} />);
    expect(screen.getByText(formattedDate)).toBeInTheDocument();
  });

  it('applies correct styling when the message is from the studio', () => {
    const mockMessageStudio = {
      ...mockMessage,
      fromStudio: true,
      studioName: 'Test_Studio',
    };

    const { container } = render(<Message message={mockMessageStudio} />);
    expect(container.querySelector('.to')).toBeInTheDocument();
  });
});
