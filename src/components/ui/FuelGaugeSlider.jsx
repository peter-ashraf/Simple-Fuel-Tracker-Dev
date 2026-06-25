// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { Fuel } from 'lucide-react';
import { cn } from './index';

export function FuelGaugeSlider({ value, onChange, disabled = false }) {
  const rotation = (value / 100) * 180 - 90;

  const getColor = (val) => {
    if (val <= 15) return '#ff4d4f';
    if (val <= 35) return '#ffb020';
    return '#20e6b7';
  };

  const currentColor = getColor(value);
  const radius = 80;
  const center = 100;
  const ticks = Array.from({ length: 9 }, (_, index) => {
    const angle = (-90 + index * 22.5) * (Math.PI / 180);
    const outer = radius + 8;
    const inner = index % 2 === 0 ? radius - 10 : radius - 4;
    return {
      x1: center + Math.cos(angle) * outer,
      y1: center + Math.sin(angle) * outer,
      x2: center + Math.cos(angle) * inner,
      y2: center + Math.sin(angle) * inner,
    };
  });

  return (
    <div className={cn("w-full select-none transition-opacity duration-300", disabled && "opacity-45 pointer-events-none")}>
      <div className="flex items-center gap-3 text-[var(--text-secondary)]">
        <Fuel className="h-5 w-5 text-[var(--accent-primary)]" strokeWidth={1.8} />
        <span className="text-sm font-bold">Fuel level after fill</span>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <svg viewBox="0 0 200 116" className="h-auto w-full overflow-visible">
          <defs>
            <linearGradient id="fuelGaugeArc" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#ff4d4f" />
              <stop offset="28%" stopColor="#ffb020" />
              <stop offset="55%" stopColor="#64d96b" />
              <stop offset="100%" stopColor="#20e6b7" />
            </linearGradient>
            <filter id="fuelGaugeGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
            fill="none"
            stroke="rgba(127,139,154,0.28)"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <motion.path
            d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
            fill="none"
            stroke="url(#fuelGaugeArc)"
            strokeWidth="10"
            strokeLinecap="round"
            filter="url(#fuelGaugeGlow)"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: value / 100 }}
            transition={{ type: "spring", stiffness: 58, damping: 16 }}
          />
          {ticks.map((tick, index) => (
            <line
              key={index}
              x1={tick.x1}
              y1={tick.y1}
              x2={tick.x2}
              y2={tick.y2}
              stroke="currentColor"
              strokeWidth={index % 2 === 0 ? 2 : 1.3}
              strokeLinecap="round"
              className="text-slate-400 dark:text-slate-500"
            />
          ))}
          <text x="20" y="109" fill="currentColor" className="text-xs font-bold text-slate-500">E</text>
          <text x="174" y="109" fill="currentColor" className="text-xs font-bold text-slate-500">F</text>
          <text x="100" y="76" fill="currentColor" className="text-xs font-bold text-slate-500" textAnchor="middle">1/2</text>
          <motion.g
            initial={{ rotate: -90 }}
            animate={{ rotate: rotation }}
            transition={{ type: "spring", stiffness: 68, damping: 16 }}
            style={{ originX: "100px", originY: "100px" }}
          >
            <path
              d="M 96 100 L 100 38 L 104 100 Z"
              fill={currentColor}
              filter="url(#fuelGaugeGlow)"
            />
          </motion.g>
          <circle cx="100" cy="100" r="10" fill="rgba(127,139,154,0.34)" stroke="rgba(255,255,255,0.24)" strokeWidth="2" />
          <circle cx="100" cy="100" r="5" fill="#07111c" />
        </svg>

        <div className="min-w-[94px] text-end">
          <p className="text-4xl font-black leading-none tracking-normal" style={{ color: currentColor }}>
            {value}%
          </p>
          <p className="mt-2 text-sm font-semibold text-[var(--text-secondary)]">Estimated</p>
        </div>
      </div>

      <div className="relative mt-5 w-full">
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          className="premium-fuel-range w-full cursor-pointer appearance-none rounded-full outline-none disabled:cursor-not-allowed"
          style={{
            background: `linear-gradient(to right, ${currentColor} ${value}%, rgba(127,139,154,0.22) ${value}%)`,
            '--fuel-thumb-color': currentColor,
          }}
        />
        <style dangerouslySetInnerHTML={{__html: `
          .premium-fuel-range {
            height: 10px;
          }
          .premium-fuel-range::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 26px;
            height: 26px;
            border-radius: 50%;
            background: #f8fbff;
            cursor: pointer;
            border: 3px solid var(--fuel-thumb-color);
            box-shadow: 0 0 20px color-mix(in srgb, var(--fuel-thumb-color) 38%, transparent);
            transition: border-color 0.2s;
          }
          .premium-fuel-range::-moz-range-thumb {
            width: 26px;
            height: 26px;
            border-radius: 50%;
            background: #f8fbff;
            border: 3px solid var(--fuel-thumb-color);
            box-shadow: 0 0 20px color-mix(in srgb, var(--fuel-thumb-color) 38%, transparent);
          }
          .dark .premium-fuel-range::-webkit-slider-thumb {
             background: #07111c;
          }
          .dark .premium-fuel-range::-moz-range-thumb {
             background: #07111c;
          }
        `}} />
      </div>
    </div>
  );
}
