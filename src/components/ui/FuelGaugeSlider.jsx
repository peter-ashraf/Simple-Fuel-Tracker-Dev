// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { Fuel } from 'lucide-react';
import { cn } from './index';

export function FuelGaugeSlider({ value, onChange, disabled = false }) {
  const safeValue = Math.min(Math.max(Number(value) || 0, 0), 100);

  // Wider gauge geometry with visible endpoint needle positions.
  // 0% points near E, 50% points up, 100% points near F without hiding on the arc.
  const centerX = 130;
  const centerY = 118;
  const radius = 78;
  const needleLength = 72;
  const angleDegrees = 190 + safeValue * 1.6;
  const angle = angleDegrees * (Math.PI / 180);
  const needleX = centerX + Math.cos(angle) * needleLength;
  const needleY = centerY + Math.sin(angle) * needleLength;

  const getColor = (val) => {
    if (val <= 20) return '#ff4d4f';
    if (val <= 40) return '#ffb020';
    return '#20e6b7';
  };

  const currentColor = getColor(safeValue);
  const statusLabel = safeValue >= 98 ? 'Full tank' : safeValue < 35 ? 'Low fuel' : 'Partial fill';

  return (
    <div className={cn('fillup-fuel-gauge', disabled && 'is-disabled')}>
      <div className="fillup-gauge-heading">
        <span className="fillup-gauge-icon"><Fuel className="h-4 w-4" strokeWidth={1.9} /></span>
        <span>
          <strong>Fuel level after fill</strong>
          <small>Used to estimate range and partial fill-ups</small>
        </span>
        <em>{statusLabel}</em>
      </div>

      <div className="fillup-gauge-body">
        <svg viewBox="0 0 260 144" className="fillup-gauge-svg" aria-hidden="true">
          <defs>
            <linearGradient id="fillupGaugeArc" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#ff4d4f" />
              <stop offset="34%" stopColor="#ffb020" />
              <stop offset="62%" stopColor="#64d96b" />
              <stop offset="100%" stopColor="#20e6b7" />
            </linearGradient>
            <filter id="fillupGaugeGlow" x="-35%" y="-35%" width="170%" height="170%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <path
            d={`M ${centerX - radius} 116 A ${radius} ${radius} 0 0 1 ${centerX + radius} 116`}
            fill="none"
            stroke="rgba(127,139,154,0.28)"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <motion.path
            d={`M ${centerX - radius} 116 A ${radius} ${radius} 0 0 1 ${centerX + radius} 116`}
            fill="none"
            stroke="url(#fillupGaugeArc)"
            strokeWidth="9"
            strokeLinecap="round"
            filter="url(#fillupGaugeGlow)"
            initial={false}
            animate={{ pathLength: safeValue / 100 }}
            transition={{ type: 'spring', stiffness: 90, damping: 22 }}
          />

          {[0, 25, 50, 75, 100].map((tick) => {
            const tickAngle = (190 + tick * 1.6) * (Math.PI / 180);
            const outer = radius + 7;
            const inner = tick % 50 === 0 ? radius - 11 : radius - 5;
            return (
              <line
                key={tick}
                x1={centerX + Math.cos(tickAngle) * outer}
                y1={centerY + Math.sin(tickAngle) * outer}
                x2={centerX + Math.cos(tickAngle) * inner}
                y2={centerY + Math.sin(tickAngle) * inner}
                stroke="currentColor"
                strokeWidth={tick % 50 === 0 ? 2 : 1.4}
                strokeLinecap="round"
                className="fillup-gauge-tick"
              />
            );
          })}

          <text x="51" y="136" fill="currentColor" className="fillup-gauge-letter">E</text>
          <text x="202" y="136" fill="currentColor" className="fillup-gauge-letter">F</text>
          <text x={centerX} y="78" fill="currentColor" className="fillup-gauge-half" textAnchor="middle">1/2</text>

          <motion.line
            x1={centerX}
            y1={centerY}
            x2={needleX}
            y2={needleY}
            stroke={currentColor}
            strokeWidth="6"
            strokeLinecap="round"
            filter="url(#fillupGaugeGlow)"
            initial={false}
            animate={{ x2: needleX, y2: needleY }}
            transition={{ type: 'spring', stiffness: 90, damping: 22 }}
          />
          <motion.circle
            r="4.8"
            fill={currentColor}
            filter="url(#fillupGaugeGlow)"
            initial={false}
            animate={{ cx: needleX, cy: needleY }}
            transition={{ type: 'spring', stiffness: 90, damping: 22 }}
          />
          <circle cx={centerX} cy={centerY} r="11" fill="rgba(127,139,154,0.34)" stroke="rgba(255,255,255,0.24)" strokeWidth="2" />
          <circle cx={centerX} cy={centerY} r="5.5" fill="#07111c" />
        </svg>

        <div className="fillup-gauge-value" style={{ color: currentColor }}>
          <strong>{safeValue}%</strong>
          <span>after fill</span>
        </div>
      </div>

      <input
        type="range"
        min="0"
        max="100"
        step="5"
        value={safeValue}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled}
        className="fillup-gauge-range"
        style={{
          background: `linear-gradient(to right, ${currentColor} ${safeValue}%, rgba(127,139,154,0.22) ${safeValue}%)`,
          '--fuel-thumb-color': currentColor,
        }}
      />
    </div>
  );
}
