import { createElement, useState } from "react";
import {
  Car,
  Check,
  ChevronDown,
  ChevronRight,
  Gauge,
  Wrench,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "./ui";

const MotionDiv = motion.div;

export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  action,
  className,
  centered = false,
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4",
        centered && "items-center text-center",
        className,
      )}
    >
      <div className={cn("min-w-0", centered && "mx-auto")}>
        {eyebrow && <p className="screen-eyebrow">{eyebrow}</p>}
        <h1 className="screen-title">{title}</h1>
        {subtitle && <p className="screen-subtitle">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function GlassCard({ as = "div", className, children, ...props }) {
  return createElement(
    as,
    {
      className: cn("premium-card", className),
      ...props,
    },
    children,
  );
}

export function IconButton({ icon, label, active = false, className, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("icon-button", active && "icon-button-active", className)}
      {...props}
    >
      {createElement(icon, { className: "h-5 w-5", strokeWidth: 1.9 })}
    </button>
  );
}

export function VehicleChip({
  vehicles = [],
  selectedVehicleId,
  setSelectedVehicleId,
  activeVehicle,
  className,
  showIcon = true,
}) {
  const [open, setOpen] = useState(false);
  const selected =
    activeVehicle || vehicles.find((vehicle) => vehicle.id === selectedVehicleId);

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="vehicle-chip"
      >
        {showIcon && <Car className="h-5 w-5" strokeWidth={1.8} />}
        <span className="truncate">{selected?.name || "Select vehicle"}</span>
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
          strokeWidth={2}
        />
      </button>

      <AnimatePresence>
        {open && vehicles.length > 0 && (
          <MotionDiv
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="vehicle-menu"
          >
            {vehicles.map((vehicle) => {
              const isActive = vehicle.id === selectedVehicleId;
              return (
                <button
                  key={vehicle.id}
                  type="button"
                  onClick={() => {
                    setSelectedVehicleId?.(vehicle.id);
                    setOpen(false);
                  }}
                  className={cn("vehicle-menu-item", isActive && "active")}
                >
                  <span className="truncate">{vehicle.name}</span>
                  {isActive && <Check className="h-4 w-4" strokeWidth={2.2} />}
                </button>
              );
            })}
          </MotionDiv>
        )}
      </AnimatePresence>
    </div>
  );
}

export function VehicleArt({
  className,
  src,
  fallbackSrcs = [],
  alt = "Vehicle",
  imageOffsetX = 0,
  imageOffsetY = 0,
  objectPosition = "center center",
  imageZoom = 1,
}) {
  const candidates = [src, ...fallbackSrcs].filter(Boolean);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const currentSrc = candidates[candidateIndex];
  const hasImage = Boolean(currentSrc);
  const safeZoom = Number.isFinite(Number(imageZoom))
    ? Math.min(Math.max(Number(imageZoom), 0.45), 2.6)
    : 1;
  const safeOffsetX = Number.isFinite(Number(imageOffsetX))
    ? Math.min(Math.max(Number(imageOffsetX), -220), 220)
    : 0;
  const safeOffsetY = Number.isFinite(Number(imageOffsetY))
    ? Math.min(Math.max(Number(imageOffsetY), -140), 140)
    : 0;

  return (
    <div
      className={cn(
        "vehicle-art",
        hasImage && "vehicle-art-with-photo",
        className,
      )}
      aria-hidden={hasImage ? undefined : "true"}
    >
      {!hasImage && <div className="vehicle-art-grid" />}
      <div className="vehicle-art-glow" />

      {hasImage ? (
        <div className="vehicle-photo-shell">
          <div className="vehicle-photo-backdrop" />
          <div className="vehicle-photo-floor-glow" />
          <img
            key={currentSrc}
            src={currentSrc}
            alt={alt}
            className="vehicle-art-photo"
            style={{
              "--vehicle-image-x": `${safeOffsetX}px`,
              "--vehicle-image-y": `${safeOffsetY}px`,
              "--vehicle-image-zoom": safeZoom,
              "--vehicle-object-position": objectPosition,
              objectPosition,
              "--vehicle-photo-scale": safeZoom,
            }}
            onError={() => {
              setCandidateIndex((index) =>
                index + 1 < candidates.length ? index + 1 : candidates.length,
              );
            }}
            draggable="false"
          />
        </div>
      ) : (
        <div className="vehicle-art-car" role="img" aria-label={alt}>
          <div className="vehicle-art-roof" />
          <div className="vehicle-art-body" />
          <div className="vehicle-art-window" />
          <div className="vehicle-art-light vehicle-art-light-left" />
          <div className="vehicle-art-light vehicle-art-light-right" />
          <div className="vehicle-art-wheel vehicle-art-wheel-left" />
          <div className="vehicle-art-wheel vehicle-art-wheel-right" />
        </div>
      )}
    </div>
  );
}

export function MetricTile({
  icon: Icon,
  label,
  value,
  unit,
  trend,
  tone = "teal",
  className,
}) {
  return (
    <GlassCard className={cn("metric-tile", className)}>
      <div className={cn("metric-icon", `metric-icon-${tone}`)}>
        {Icon && <Icon className="h-5 w-5" strokeWidth={1.9} />}
      </div>
      <div className="min-w-0">
        <p className="metric-label">{label}</p>
        <div className="metric-value-row">
          <span className="metric-value-text">{value}</span>
          {unit && <span className="metric-unit-text">{unit}</span>}
        </div>
        {trend && <p className="metric-trend">{trend}</p>}
      </div>
    </GlassCard>
  );
}

export function SectionTitle({ title, action, className }) {
  return (
    <div className={cn("section-heading", className)}>
      <h2>{title}</h2>
      {action}
    </div>
  );
}

export function Sparkline({
  values = [],
  labels = [],
  height = 120,
  color = "#20E6B7",
  id = "sparkline",
  className,
}) {
  const width = 360;
  const safeValues = values.map((value) => Number(value) || 0);
  const hasData = safeValues.some((value) => value > 0);
  const max = Math.max(...safeValues, 1);
  const min = Math.min(...safeValues, 0);
  const range = max - min || 1;
  const points = safeValues.length
    ? safeValues.map((value, index) => {
        const x =
          safeValues.length === 1
            ? width / 2
            : (index / (safeValues.length - 1)) * width;
        const y = height - ((value - min) / range) * (height - 18) - 8;
        return { x, y, value };
      })
    : [];
  const linePath = points.length
    ? `M ${points.map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" L ")}`
    : "";
  const areaPath = points.length
    ? `${linePath} L ${width} ${height} L 0 ${height} Z`
    : "";

  return (
    <div className={cn("sparkline-wrap", className)}>
      {hasData ? (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Trend chart"
          className="sparkline-svg"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={`${id}-area`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.42" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
            <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g opacity="0.22">
            {[0, 1, 2, 3].map((line) => (
              <line
                key={line}
                x1="0"
                x2={width}
                y1={(height / 4) * line + 8}
                y2={(height / 4) * line + 8}
                stroke="currentColor"
                strokeWidth="1"
              />
            ))}
          </g>
          <path d={areaPath} fill={`url(#${id}-area)`} />
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#${id}-glow)`}
          />
          {points.map((point, index) => (
            <g key={`${point.x}-${index}`}>
              <line
                x1={point.x}
                x2={point.x}
                y1={point.y}
                y2={height}
                stroke={color}
                strokeOpacity="0.18"
                strokeDasharray="3 5"
              />
              <circle cx={point.x} cy={point.y} r="4" fill={color} />
            </g>
          ))}
        </svg>
      ) : (
        <div className="sparkline-empty">
          <Gauge className="h-5 w-5" strokeWidth={1.8} />
          <span>More fill-ups will unlock trends</span>
        </div>
      )}
      {labels.length > 0 && (
        <div className="sparkline-labels">
          {labels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function MaintenanceAlertCard({
  title,
  subtitle,
  detail,
  icon = Wrench,
  tone = "warning",
  onClick,
}) {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn("maintenance-alert-card", `maintenance-alert-${tone}`)}
    >
      <div className="maintenance-alert-icon">
        {createElement(icon, { className: "h-6 w-6", strokeWidth: 1.9 })}
      </div>
      <div className="min-w-0 flex-1 text-start">
        <p className="maintenance-alert-title">{title}</p>
        <p className="maintenance-alert-subtitle">{subtitle}</p>
        {detail && <div className="maintenance-progress"><span style={{ width: detail }} /></div>}
      </div>
      {onClick && <ChevronRight className="h-5 w-5 opacity-70" strokeWidth={2} />}
    </Component>
  );
}

export function SegmentedControl({ options, value, onChange, name }) {
  return (
    <div className="segmented-control" role="radiogroup" aria-label={name}>
      {options.map((option) => {
        const id = option.value ?? option.id;
        const isActive = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(id)}
            className={cn("segmented-option", isActive && "active")}
          >
            {isActive && (
              <MotionDiv
                layoutId={`${name || "segmented"}-pill`}
                className="segmented-active-bg"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SettingsRow({
  icon,
  title,
  subtitle,
  tone = "teal",
  active = false,
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("settings-row", active && "active")}
    >
      <span className={cn("settings-row-icon", `settings-row-icon-${tone}`)}>
        {createElement(icon, { className: "h-5 w-5", strokeWidth: 1.9 })}
      </span>
      <span className="min-w-0 flex-1 text-start">
        <span className="settings-row-title">{title}</span>
        {subtitle && <span className="settings-row-subtitle">{subtitle}</span>}
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
    </button>
  );
}
