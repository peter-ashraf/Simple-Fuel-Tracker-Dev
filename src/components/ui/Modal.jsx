import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Warning, Trash, WarningCircle } from '@phosphor-icons/react';
import { cn } from './index';

const MotionDiv = motion.div;

export const Modal = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'md',
  showCloseButton = true,
  closeOnBackdrop = true 
}) => {
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg', 
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <MotionDiv
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeOnBackdrop ? onClose : undefined}
          />
          
          {/* Modal Content */}
          <MotionDiv
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ 
              type: 'spring', 
              stiffness: 300, 
              damping: 25,
              duration: 0.2 
            }}
            className={cn(
              "relative w-full glass-card rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800",
              sizeClasses[size]
            )}
          >
            {/* Header */}
            {(title || showCloseButton) && (
              <div className="flex items-center justify-between mb-4">
                {title && (
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    {title}
                  </h3>
                )}
                {showCloseButton && (
                  <button
                    onClick={onClose}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label="Close modal"
                  >
                    <X weight="duotone" className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}
            
            {/* Content */}
            <div className="relative">
              {children}
            </div>
          </MotionDiv>
        </div>
      )}
    </AnimatePresence>
  );
};

export const ConfirmModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = 'Confirm', 
  cancelText = 'Cancel',
  variant = 'danger',
  icon: Icon
}) => {
  const variantClasses = {
    danger: 'bg-red-500 hover:bg-red-600 text-white',
    warning: 'bg-amber-500 hover:bg-amber-600 text-white', 
    info: 'bg-blue-500 hover:bg-blue-600 text-white'
  };

  const defaultIcons = {
    danger: Warning,
    warning: WarningCircle,
    info: WarningCircle
  };

  const ModalIcon = Icon || defaultIcons[variant] || WarningCircle;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <div className="text-center">
        <div className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4",
          variant === 'danger' && 'bg-red-100 dark:bg-red-500/20 text-red-500',
          variant === 'warning' && 'bg-amber-100 dark:bg-amber-500/20 text-amber-500',
          variant === 'info' && 'bg-blue-100 dark:bg-blue-500/20 text-blue-500'
        )}>
          <ModalIcon weight="duotone" className="w-6 h-6" />
        </div>
        
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
          {title}
        </h3>
        
        <p className="text-slate-600 dark:text-slate-400 mb-6 text-sm leading-relaxed">
          {message}
        </p>
        
        <div className="flex gap-3 justify-center">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={cn(
              "px-4 py-2.5 text-sm font-medium rounded-xl transition-colors flex items-center gap-2",
              variantClasses[variant]
            )}
          >
            {variant === 'danger' && <Trash weight="duotone" className="w-4 h-4" />}
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
};
