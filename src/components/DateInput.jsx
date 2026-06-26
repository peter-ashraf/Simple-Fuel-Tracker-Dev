import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Input, cn } from './ui';
import { Calendar } from './Calendar';
import { AnimatePresence } from 'framer-motion';

export function DateInput({ value, onChange, className, ...props }) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputPosition, setInputPosition] = useState({ top: 0, left: 0, width: 0 });
  const inputRef = useRef(null);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const [year, month, day] = String(dateString).split('-').map(Number);
    const date = year && month && day ? new Date(year, month - 1, day) : new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleInputClick = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      const viewportPadding = 12;
      const requestedLeft = rect.left + window.scrollX;
      const maxLeft = window.scrollX + window.innerWidth - rect.width - viewportPadding;

      setInputPosition({
        top: rect.bottom + window.scrollY,
        left: Math.max(window.scrollX + viewportPadding, Math.min(requestedLeft, maxLeft)),
        width: rect.width
      });
    }
    setIsOpen((current) => !current);
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
            className={cn("calendar-input cursor-pointer", className)}
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
