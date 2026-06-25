import { createElement, forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';

// eslint-disable-next-line react-refresh/only-export-components
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export const Card = forwardRef(({ className, children, ...props }, ref) => (
  <div ref={ref} className={cn("premium-card p-5", className)} {...props}>
    {children}
  </div>
));
Card.displayName = "Card"

export const MetricCard = forwardRef(({ as: Component = "div", className, children, variant = "default", ...props }, ref) => {
  const variants = {
    default: "premium-card",
    secondary: "premium-card",
    accent: "premium-card border-emerald-500/20"
  };
  return createElement(
    Component,
    {
      ref,
      className: cn(`${variants[variant]} p-5`, className),
      ...props
    },
    children
  );
});
MetricCard.displayName = "MetricCard"

function getNumericInputMode({ type, step, inputMode }) {
  if (inputMode || type !== "number") return inputMode;
  return step && step !== "1" ? "decimal" : "numeric";
}

function formatNumericInputValue(value) {
  if (value === null || value === undefined || value === "") return "";
  const raw = String(value).replace(/,/g, "");
  if (!/^-?\d*\.?\d*$/.test(raw) || raw === "-" || raw === ".") return String(value);

  const sign = raw.startsWith("-") ? "-" : "";
  const unsigned = sign ? raw.slice(1) : raw;
  const [integerPart, decimalPart] = unsigned.split(".");
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${formattedInteger}${decimalPart !== undefined ? `.${decimalPart}` : ""}`;
}

export const Input = forwardRef(({ className, inputMode, type, step, value, onChange, ...props }, ref) => {
  const isNumeric = type === "number";
  const displayValue = isNumeric ? formatNumericInputValue(value) : value;

  const handleChange = (event) => {
    if (!isNumeric || !onChange) {
      onChange?.(event);
      return;
    }

    const rawValue = event.target.value.replace(/,/g, "");
    onChange({
      ...event,
      target: { ...event.target, value: rawValue },
      currentTarget: { ...event.currentTarget, value: rawValue },
    });
  };

  return (
    <input
      ref={ref}
      type={isNumeric ? "text" : type}
      step={step}
      value={displayValue}
      onChange={handleChange}
      inputMode={getNumericInputMode({ type, step, inputMode })}
      className={cn("input-field", className)}
      {...props}
    />
  );
});
Input.displayName = "Input"

export const Label = forwardRef(({ className, children, ...props }, ref) => (
  <label ref={ref} className={cn("text-xs font-semibold uppercase tracking-wider mb-2 block ms-1", className)} {...props}>
    {children}
  </label>
));
Label.displayName = "Label"

export { Modal, ConfirmModal } from './Modal';
export { IconPicker, ICON_MAP_DATA } from './IconPicker';
export { FuelGaugeSlider } from './FuelGaugeSlider';

export const PageWrapper = ({ children, className }) => (
  <motion.div
    initial={{ opacity: 0, y: 20, scale: 0.98 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
    transition={{ type: 'spring', stiffness: 280, damping: 20 }}
    className={cn("w-full relative", className)}
  >
    {children}
  </motion.div>
);
