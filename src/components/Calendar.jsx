import { useState, useRef, useEffect } from 'react';
import { CaretLeft, CaretRight, CalendarBlank as CalendarIcon } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';

const MotionDiv = motion.div;
const MotionButton = motion.button;

export function Calendar({ value, onChange, onClose }) {
  const [currentDate, setCurrentDate] = useState(new Date(value || new Date()));
  const [selectedDate, setSelectedDate] = useState(value ? new Date(value) : new Date());
  const [view, setView] = useState('days'); // 'days', 'months', 'years'
  const [slideDirection, setSlideDirection] = useState('neutral'); // 'left', 'right', 'neutral'
  const calendarRef = useRef(null);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const handlePreviousMonth = () => {
    setSlideDirection('left');
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setSlideDirection('right');
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const handleMonthClick = () => {
    setView('months');
  };

  const handleYearClick = () => {
    setView('years');
  };

  const handleMonthSelect = (monthIndex) => {
    setCurrentDate(new Date(currentDate.getFullYear(), monthIndex, 1));
    setView('days');
  };

  const handleYearSelect = (year) => {
    setCurrentDate(new Date(year, currentDate.getMonth(), 1));
    setView('months');
  };

  const handleYearNavigation = (direction) => {
    const currentYear = currentDate.getFullYear();
    const startYear = Math.floor(currentYear / 10) * 10;
    const newYear = direction === 'prev' ? startYear - 10 : startYear + 10;
    setSlideDirection(direction === 'prev' ? 'left' : 'right');
    setCurrentDate(new Date(newYear, 0, 1));
  };

  const handleDateClick = (day) => {
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    setSelectedDate(newDate);
    // Format date as YYYY-MM-DD in local timezone to avoid UTC conversion issues
    const year = newDate.getFullYear();
    const month = String(newDate.getMonth() + 1).padStart(2, '0');
    const date = String(newDate.getDate()).padStart(2, '0');
    onChange(`${year}-${month}-${date}`);
    onClose();
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
    // Format date as YYYY-MM-DD in local timezone to avoid UTC conversion issues
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const date = String(today.getDate()).padStart(2, '0');
    onChange(`${year}-${month}-${date}`);
    onClose();
  };

  const handleClear = () => {
    onChange('');
    onClose();
  };

  const renderDays = () => {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const days = [];

    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-10"></div>);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = 
        day === new Date().getDate() &&
        currentDate.getMonth() === new Date().getMonth() &&
        currentDate.getFullYear() === new Date().getFullYear();

      const isSelected = 
        day === selectedDate.getDate() &&
        currentDate.getMonth() === selectedDate.getMonth() &&
        currentDate.getFullYear() === selectedDate.getFullYear();

      days.push(
        <button
          key={day}
          onClick={() => handleDateClick(day)}
          className={`h-10 w-10 rounded-lg flex items-center justify-center text-sm font-medium transition-all ${
            isSelected
              ? 'bg-emerald-500 text-white hover:bg-emerald-600'
              : isToday
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-2 border-emerald-300 dark:border-emerald-600'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white'
          }`}
        >
          {day}
        </button>
      );
    }

    return days;
  };

  const renderMonths = () => {
    return monthNames.map((month, index) => {
      const isCurrentMonth = index === new Date().getMonth() && 
                            currentDate.getFullYear() === new Date().getFullYear();
      const isSelected = index === selectedDate.getMonth() && 
                        currentDate.getFullYear() === selectedDate.getFullYear();

      return (
        <button
          key={month}
          onClick={() => handleMonthSelect(index)}
          className={`h-12 w-full rounded-lg flex items-center justify-center text-sm font-medium transition-all ${
            isSelected
              ? 'bg-emerald-500 text-white hover:bg-emerald-600'
              : isCurrentMonth
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-2 border-emerald-300 dark:border-emerald-600'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white'
          }`}
        >
          {month.substring(0, 3)}
        </button>
      );
    });
  };

  const renderYears = () => {
    const currentYear = currentDate.getFullYear();
    const startYear = Math.floor(currentYear / 10) * 10;
    const years = [];

    for (let i = 0; i < 12; i++) {
      const year = startYear + i - 1;
      const isCurrentYear = year === new Date().getFullYear();
      const isSelected = year === selectedDate.getFullYear();

      years.push(
        <button
          key={year}
          onClick={() => handleYearSelect(year)}
          className={`h-12 w-full rounded-lg flex items-center justify-center text-sm font-medium transition-all ${
            isSelected
              ? 'bg-emerald-500 text-white hover:bg-emerald-600'
              : isCurrentYear
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-2 border-emerald-300 dark:border-emerald-600'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white'
          }`}
        >
          {year}
        </button>
      );
    }

    return years;
  };

  return (
    <MotionDiv
      initial={{ opacity: 0, scale: 0.95, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      transition={{ duration: 0.15 }}
      ref={calendarRef}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden"
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <MotionButton
            onClick={() => {
              if (view === 'days') {
                handlePreviousMonth();
              } else if (view === 'years') {
                handleYearNavigation('prev');
              } else {
                setSlideDirection('left');
                setCurrentDate(new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), 1));
              }
            }}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            whileHover={{ x: -2 }}
            whileTap={{ x: -4 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            <CaretLeft weight="duotone" className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          </MotionButton>
          
          <div className="text-center">
            {view === 'days' && (
              <div className="space-y-1">
                <button
                  onClick={handleMonthClick}
                  className="font-semibold text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                >
                  {monthNames[currentDate.getMonth()]}
                </button>
                <button
                  onClick={handleYearClick}
                  className="text-sm text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                >
                  {currentDate.getFullYear()}
                </button>
              </div>
            )}
            {view === 'months' && (
              <button
                onClick={handleYearClick}
                className="font-semibold text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
              >
                {currentDate.getFullYear()}
              </button>
            )}
            {view === 'years' && (
              <div className="font-semibold text-slate-900 dark:text-white">
                {Math.floor(currentDate.getFullYear() / 10) * 10 - 1} - {Math.floor(currentDate.getFullYear() / 10) * 10 + 10}
              </div>
            )}
          </div>
          
          <MotionButton
            onClick={() => {
              if (view === 'days') {
                handleNextMonth();
              } else if (view === 'years') {
                handleYearNavigation('next');
              } else {
                setSlideDirection('right');
                setCurrentDate(new Date(currentDate.getFullYear() + 1, currentDate.getMonth(), 1));
              }
            }}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            whileHover={{ x: 2 }}
            whileTap={{ x: 4 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            <CaretRight weight="duotone" className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          </MotionButton>
        </div>

        {/* Content based on view */}
        {view === 'days' && (
          <>
            {/* Week days - static, not animated */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {weekDays.map(day => (
                <div
                  key={day}
                  className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 py-2"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Animated days grid */}
            <AnimatePresence mode="popLayout">
              <MotionDiv
                key={`days-${currentDate.getMonth()}-${currentDate.getFullYear()}`}
                initial={{ x: slideDirection === 'right' ? 100 : slideDirection === 'left' ? -100 : 0, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: slideDirection === 'right' ? -100 : slideDirection === 'left' ? 100 : 0, opacity: 0 }}
                transition={{ duration: 0.15, ease: "linear" }}
              >
                <div className="grid grid-cols-7 gap-1">
                  {renderDays()}
                </div>
              </MotionDiv>
            </AnimatePresence>
          </>
        )}

          <AnimatePresence mode="popLayout">
          {view === 'months' && (
            <MotionDiv
              key={`months-${currentDate.getFullYear()}`}
              initial={{ x: slideDirection === 'right' ? 100 : slideDirection === 'left' ? -100 : 0, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: slideDirection === 'right' ? -100 : slideDirection === 'left' ? 100 : 0, opacity: 0 }}
              transition={{ duration: 0.15, ease: "linear" }}
            >
              <div className="grid grid-cols-3 gap-2">
                {renderMonths()}
              </div>
            </MotionDiv>
          )}

          {view === 'years' && (
            <MotionDiv
              key={`years-${Math.floor(currentDate.getFullYear() / 10)}`}
              initial={{ x: slideDirection === 'right' ? 100 : slideDirection === 'left' ? -100 : 0, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: slideDirection === 'right' ? -100 : slideDirection === 'left' ? 100 : 0, opacity: 0 }}
              transition={{ duration: 0.15, ease: "linear" }}
            >
              <div className="grid grid-cols-3 gap-2">
                {renderYears()}
              </div>
            </MotionDiv>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="flex justify-between mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={handleClear}
            className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Clear
          </button>
          <button
            onClick={handleToday}
            className="px-3 py-1.5 text-sm bg-emerald-500 text-white hover:bg-emerald-600 rounded-lg transition-colors font-medium"
          >
            Today
          </button>
        </div>
      </div>
    </MotionDiv>
  );
}
