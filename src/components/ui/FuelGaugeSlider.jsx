import React from 'react';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { cn } from './index';

export function FuelGaugeSlider({ value, onChange, disabled = false }) {
  // Value is 0 to 100
  // Arc calculation
  // A semi-circle is 180 degrees.
  // We'll map 0-100 to -90 to 90 degrees for the needle.
  
  const rotation = (value / 100) * 180 - 90;

  // Determine color based on value
  const getColor = (val) => {
    if (val <= 15) return '#ef4444'; // red-500
    if (val <= 30) return '#f59e0b'; // amber-500
    if (val <= 60) return '#eab308'; // yellow-500
    return '#10b981'; // emerald-500
  };

  const currentColor = getColor(value);

  // SVG parameters for the arc
  const radius = 80;
  const strokeWidth = 12;
  const center = 100;

  // Render arc segments for background (gradient or multi-colored)
  // Instead of complex segments, we use a conic gradient or a simple arc
  return (
    <div className={cn("flex flex-col items-center w-full max-w-[300px] mx-auto py-4 select-none transition-opacity duration-300", disabled && "opacity-40 pointer-events-none")}>
      {/* Value Display */}
      <div className="flex flex-col items-center mb-6">
         <span className="text-4xl font-black tabular-nums tracking-tighter drop-shadow-sm transition-colors duration-300" style={{ color: currentColor }}>
           {value}<span className="text-2xl text-slate-400 font-bold">%</span>
         </span>
      </div>

      <div className="relative w-full aspect-[2/1] mb-8 flex justify-center">
        {/* SVG Gauge Background */}
        <svg viewBox="0 0 200 110" className="w-full h-full overflow-visible drop-shadow-sm">
          {/* Track Background */}
          <path
            d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-slate-200 dark:text-slate-800"
            strokeLinecap="round"
          />
          
          {/* Active Track */}
          <motion.path
            d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
            fill="none"
            stroke={currentColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: value / 100 }}
            transition={{ type: "spring", stiffness: 50, damping: 15 }}
          />
          
          {/* Needle Center Pin */}
          <circle cx={center} cy={center} r={6} fill={currentColor} className="z-10 relative" />
          
          {/* Needle */}
          <motion.path
            initial={{ rotate: -90 }}
            animate={{ rotate: rotation }}
            transition={{ type: "spring", stiffness: 60, damping: 15 }}
            style={{ originX: 0.5, originY: 1 }}
            d={`M ${center - 4} ${center} L ${center} ${center - radius + 10} L ${center + 4} ${center} Z`}
            fill={currentColor}
          />

          {/* Labels E and F */}
          <text x={center - radius - 15} y={center} fill="currentColor" className="text-xs font-bold text-slate-400" dominantBaseline="middle" textAnchor="middle">E</text>
          <text x={center + radius + 15} y={center} fill="currentColor" className="text-xs font-bold text-slate-400" dominantBaseline="middle" textAnchor="middle">F</text>
        </svg>
      </div>

      {/* Slider Input */}
      <div className="w-full px-6 relative mt-2">
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          className="w-full h-3 appearance-none bg-slate-200 dark:bg-slate-800 rounded-full outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all cursor-pointer touch-none disabled:cursor-not-allowed"
          style={{
            background: `linear-gradient(to right, ${currentColor} ${value}%, var(--tw-colors-slate-200) ${value}%)`
          }}
        />
        {/* Custom thumb styles using Tailwind are tricky for all browsers, so we use a simple input range, but the design mostly relies on the gauge above */}
        <style dangerouslySetInnerHTML={{__html: `
          input[type=range]::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: #fff;
            cursor: pointer;
            border: 2px solid ${currentColor};
            box-shadow: 0 2px 6px rgba(0,0,0,0.1);
            transition: border-color 0.2s;
          }
          .dark input[type=range]::-webkit-slider-thumb {
             background: #1e293b;
          }
        `}} />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-4 text-center">
        Drag to set the final fuel level
      </p>
    </div>
  );
}
