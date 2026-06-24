import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CalendarBlank as CalendarIcon } from '@phosphor-icons/react';
import { Input } from './ui';
import { Calendar } from './Calendar';
import { AnimatePresence } from 'framer-motion';

export function DateInput({ value, onChange, ...props }) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputPosition, setInputPosition] = useState({ top: 0, left: 0, width: 0 });
  const inputRef = useRef(null);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleInputClick = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setInputPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
    setIsOpen(!isOpen);
  };

  const handleCalendarClose = () => {
    setIsOpen(false);
  };

  return (
    <>
      <div className="relative">
        <div className="calendar-icon-wrapper">
          <Input
            ref={inputRef}
            value={formatDate(value)}
            onClick={handleInputClick}
            readOnly
            placeholder="Select date"
            className="calendar-input cursor-pointer"
            {...props}
          />
        </div>
      </div>
      
      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <div
              style={{
                position: 'absolute',
                top: `${inputPosition.top + 8}px`,
                left: `${inputPosition.left}px`,
                width: `${inputPosition.width}px`,
                zIndex: 1000
              }}
            >
              <Calendar
                value={value}
                onChange={onChange}
                onClose={handleCalendarClose}
              />
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
