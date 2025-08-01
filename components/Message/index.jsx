'use client';
import { format } from 'date-fns';
import { useState } from 'react';
import styles from './styles.module.css';

const adminNumbers = ['3466161442', '4697185726'];

const Message = ({ message, contactName }) => {
  const [showError, setShowError] = useState(false);
  return (
    <div
      className={styles.wrapper}
      data-testid="message"
    >
      <span
        to={message.to}
        className={`${
          adminNumbers.includes(message.to) ||
          adminNumbers.includes(message.from)
            ? 'bg-red'
            : message.provider === 'zoho_voice'
            ? 'bg-purple'
            : 'bg-gray-500'
        } ${styles.container} ${message.fromStudio ? styles.to : ''} `}
      >
        <span className="flex items-center justify-between gap-1">
          {message.body}
          {message.errorMessage && (
            <button
              aria-label="Hide error"
              className="ml-1 text-gray-400 hover:text-gray-700"
              onClick={() => setShowError(!showError)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontSize: '1em',
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
              }}
              type="button"
            >
              {/* Unicode up arrow (caret up): U+25B2 ▲, or U+2303 ⌃ */}
              {/* Unicode down arrow (caret down): U+25BC ▼ */}

              <span className="w-4 h-4 text-sm text-white border border-white rounded-full p-1 flex items-center justify-center">
                !
              </span>
            </button>
          )}
        </span>
        {message.errorMessage && showError && (
          <span className="text-xs flex items-center gap-1">
            {message.errorMessage}
          </span>
        )}
      </span>
      <span
        className={`${styles.subText} ${message.fromStudio ? styles.to : ''}`}
      >
        <span
          onClick={() => setShowError(!showError)}
          className="cursor-pointer"
        >
          {message.status}
        </span>
        <span>
          {message.fromStudio
            ? (() => {
                const studioName = message.studioName.split('_').join(' ');
                const provider = message.provider || 'twilio';

                // Show "Admin" for admin messages
                if (adminNumbers.includes(message.from)) {
                  return message.studioName === 'Southlake'
                    ? 'Southlake'
                    : 'Admin';
                }

                return `${studioName} (${provider})`;
              })()
            : contactName}
        </span>
        <span>{format(new Date(message.date), 'MMM do h:mm aaa')}</span>
      </span>
    </div>
  );
};

export default Message;
