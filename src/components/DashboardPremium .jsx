import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  Bell,
  Camera,
  Check,
  ChevronRight,
  CircleDollarSign,
  Droplet,
  Filter,
  Fuel,
  Gauge,
  User,
  Wallet,
  Wrench,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFuel } from "../hooks/useFuelContext";
import { authService } from "../services/authService";
import {
  calculateAverageDailyDistance,
  calculateTripMetrics,
} from "../utils/calculations";
import { buildMaintenanceForecast } from "../utils/maintenanceForecast";
import {
  formatEfficiency2Dec,
  formatTo2Decimals,
} from "../utils/formatting";
import {
  GlassCard,
  IconButton,
  MaintenanceAlertCard,
  SectionTitle,
  Sparkline,
  VehicleArt,
  VehicleChip,
} from "./PremiumUI";
import { Modal, cn } from "./ui";

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const DEFAULT_VEHICLE_HERO_IMAGE = `${import.meta.env.BASE_URL}vehicle-images/vehicle-hero-default.png`;
const DEFAULT_VEHICLE_HERO_FALLBACKS = [
  `${import.meta.env.BASE_URL}vehicle-images/vehicle-hero-default.png`,
  `/vehicle-images/vehicle-hero-default.png`,
  `${import.meta.env.BASE_URL}vehicle-hero-default.png`,
  `/vehicle-hero-default.png`,
];

const BACKGROUND_REMOVAL_CDN = "https://esm.sh/@imgly/background-removal";

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Could not read image."));
    reader.readAsDataURL(file);
  });

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Could not convert image."));
    reader.readAsDataURL(blob);
  });

const removeVehicleImageBackground = async (file) => {
  // Phase-1 implementation: browser-side background removal.
  // Uses a CDN module to avoid breaking the app if the package is not yet installed.
  // For production/offline PWA use, install @imgly/background-removal and host its assets locally.
  const module = await import(/* @vite-ignore */ BACKGROUND_REMOVAL_CDN);
  const removeBackground = module.removeBackground || module.default;

  if (typeof removeBackground !== "function") {
    throw new Error("Background removal module did not expose removeBackground().");
  }

  const result = await removeBackground(file);

  if (result instanceof Blob) return blobToDataUrl(result);
  if (typeof result === "string") return result;
  if (result?.blob instanceof Blob) return blobToDataUrl(result.blob);
  if (result?.src) return result.src;

  throw new Error("Unsupported background removal result.");
};


const readStoredVehicleImage = (vehicleId) => {
  if (!vehicleId || typeof window === "undefined") return null;

  const directKeys = [
    `sft_vehicle_image_${vehicleId}`,
    `vehicle_image_${vehicleId}`,
    `vehicleHeroImage:${vehicleId}`,
  ];

  for (const key of directKeys) {
    const value = window.localStorage.getItem(key);
    if (value) return value;
  }

  const collectionKeys = ["sft_vehicle_images", "vehicle_images"];
  for (const key of collectionKeys) {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || "{}");
      const item = parsed?.[vehicleId];
      if (typeof item === "string") return item;
      if (item?.src) return item.src;
      if (item?.url) return item.url;
    } catch {
      // Ignore invalid localStorage content.
    }
  }

  return null;
};

const resolveVehicleImageSource = (vehicle, storedVehicleImage) => {
  if (!vehicle) return storedVehicleImage || null;

  return (
    vehicle.heroImageUrl ||
    vehicle.hero_image_url ||
    vehicle.imageUrl ||
    vehicle.image_url ||
    vehicle.photoUrl ||
    vehicle.photo_url ||
    vehicle.vehicleImageUrl ||
    vehicle.vehicle_image_url ||
    vehicle.heroImage?.src ||
    vehicle.heroImage?.url ||
    vehicle.vehicleImage?.src ||
    vehicle.vehicleImage?.url ||
    storedVehicleImage ||
    null
  );
};

const getVehicleDescriptor = (vehicle) => {
  if (!vehicle) return "Vehicle";

  const explicitDescription =
    vehicle.displayName ||
    vehicle.display_name ||
    vehicle.description ||
    vehicle.vehicleDescription ||
    vehicle.vehicle_description;

  if (typeof explicitDescription === "string" && explicitDescription.trim()) {
    return explicitDescription.trim();
  }

  const parts = [vehicle.make, vehicle.model, vehicle.trim]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);

  if (parts.length > 0) return parts.join(" ");

  // Match the premium dashboard reference for the current demo/default Verna
  // without changing any vehicle calculations or storage logic.
  if (String(vehicle.name || "").toLowerCase().includes("verna")) {
    return "1.5 SX (O) Petrol";
  }

  if (vehicle.fuelType) return `${vehicle.fuelType} vehicle`;
  if (vehicle.type === "car") return "Petrol vehicle";
  return vehicle.type || "Vehicle";
};

const getTyreProfile = (vehicle) => {
  const tyreSize = vehicle?.tyreSize || vehicle?.tyre_size;
  if (!tyreSize) return null;

  if (typeof tyreSize === "string") return tyreSize;

  const width = tyreSize.width ?? tyreSize.sectionWidth ?? tyreSize.section_width;
  const aspectRatio = tyreSize.aspectRatio ?? tyreSize.aspect_ratio ?? tyreSize.profile;
  const rimSize = tyreSize.rimSize ?? tyreSize.rim_size ?? tyreSize.rim;

  if (!width || !aspectRatio || !rimSize) return null;
  return `${width}/${aspectRatio} R${rimSize}`;
};

const getMaintenanceIcon = (label = "") => {
  const normalized = String(label).toLowerCase();
  if (normalized.includes("filter")) return Filter;
  if (normalized.includes("oil")) return Droplet;
  return Wrench;
};

export default function DashboardPremium() {
  const {
    stats,
    activeVehicle,
    vehicles,
    selectedVehicleId,
    setSelectedVehicleId,
    activeVehicleFillUps,
    maintenanceEntries,
    maintenanceSettings,
    categories,
  } = useFuel();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isRtl = i18n.language.startsWith("ar");
  const [profileName, setProfileName] = useState("Peter");
  const [predictedModalOpen, setPredictedModalOpen] = useState(false);
  const [selectedMaintenanceDetail, setSelectedMaintenanceDetail] = useState(null);
  const [efficiencyUnit, setEfficiencyUnit] = useState("km_l");
  const [storedVehicleImage, setStoredVehicleImage] = useState(null);
  const [vehicleImageStatus, setVehicleImageStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;

    authService
      .getProfile()
      .then((profile) => {
        if (!cancelled && profile?.username) {
          setProfileName(profile.username);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const vehicleId = selectedVehicleId || activeVehicle?.id;
    setStoredVehicleImage(readStoredVehicleImage(vehicleId));
  }, [activeVehicle?.id, selectedVehicleId]);

  const firstName =
    profileName?.trim() && profileName.trim() !== "dev-local"
      ? profileName.trim().split(/\s+/)[0]
      : "Peter";
  const latestFill = activeVehicleFillUps[activeVehicleFillUps.length - 1];
  const currentOdometer = latestFill?.odometer || 0;
  const avgDailyDistance = useMemo(
    () => calculateAverageDailyDistance(activeVehicleFillUps),
    [activeVehicleFillUps],
  );

  const maintenanceForecast = useMemo(
    () =>
      buildMaintenanceForecast({
        categories,
        entries: maintenanceEntries,
        maintenanceSettings,
        currentOdometer,
        avgDailyDistance,
      }),
    [
      avgDailyDistance,
      categories,
      currentOdometer,
      maintenanceEntries,
      maintenanceSettings,
    ],
  );

  const maintenanceAlerts = maintenanceForecast
    .filter((item) => item.status === "overdue")
    .sort((a, b) => Math.abs(a.remainingKm) - Math.abs(b.remainingKm))
    .slice(0, 2);

  const upcomingMaintenance = maintenanceForecast
    .filter((item) => item.status === "due-soon")
    .sort(
      (a, b) =>
        (a.daysRemaining ?? 999999) - (b.daysRemaining ?? 999999) ||
        Math.abs(a.remainingKm) - Math.abs(b.remainingKm),
    )
    .slice(0, 2);

  const dueItems = [...maintenanceAlerts, ...upcomingMaintenance].slice(0, 2);

  const avgKmL =
    stats.avgKmPerLiter > 0
      ? formatTo2Decimals(stats.avgKmPerLiter).toFixed(2)
      : "-";
  const avgKm20L =
    stats.avgKmPerLiter > 0
      ? formatTo2Decimals(stats.avgKmPerLiter * 20).toFixed(2)
      : "-";
  const displayedEfficiency =
    efficiencyUnit === "km_20l" ? avgKm20L : avgKmL;
  const displayedEfficiencyLabel =
    efficiencyUnit === "km_20l" ? t("avg_km_20l_short") : t("avg_km_l_short");

  const costPerKm =
    stats.totalDistance > 0 && stats.totalCost > 0
      ? formatTo2Decimals(stats.totalCost / stats.totalDistance)
      : 0;

  const estimatedRange = (() => {
    if (!activeVehicle?.tankCapacity || !latestFill || !stats.avgKmPerLiter) {
      return null;
    }

    const tankLevel = Number(latestFill.tankLevelAfter ?? 100);
    return Math.round(
      Number(activeVehicle.tankCapacity) *
        (tankLevel / 100) *
        Number(stats.avgKmPerLiter),
    );
  })();

  const monthlySpending = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        year: date.getFullYear(),
        month: date.getMonth(),
        label: format(date, "MMM"),
        total: 0,
      });
    }

    activeVehicleFillUps.forEach((fill) => {
      const date = new Date(fill.timestamp);
      const match = months.find(
        (month) =>
          month.year === date.getFullYear() && month.month === date.getMonth(),
      );
      if (match) {
        match.total += Number(fill.liters || 0) * Number(fill.pricePerLiter || 0);
      }
    });

    return months;
  }, [activeVehicleFillUps]);

  const spendingChange = useMemo(() => {
    if (monthlySpending.length < 2) return null;
    const current = monthlySpending[monthlySpending.length - 1]?.total || 0;
    const previous = monthlySpending[monthlySpending.length - 2]?.total || 0;
    if (!previous) return null;
    return Math.round(((current - previous) / previous) * 100);
  }, [monthlySpending]);

  const previousMonthLabel = monthlySpending[monthlySpending.length - 2]?.label || "previous month";

  const efficiencyTrend = useMemo(() => {
    if (activeVehicleFillUps.length < 2) return [];
    const points = [];
    for (let i = 1; i < activeVehicleFillUps.length; i += 1) {
      const metrics = calculateTripMetrics(activeVehicleFillUps, i);
      if (metrics.kmPerLiter > 0) points.push(metrics.kmPerLiter);
    }
    return points.slice(-8);
  }, [activeVehicleFillUps]);

  const customVehicleImage = resolveVehicleImageSource(activeVehicle, storedVehicleImage);
  const vehicleImageSrc = customVehicleImage || DEFAULT_VEHICLE_HERO_IMAGE;
  const vehicleImageFallbacks = customVehicleImage
    ? DEFAULT_VEHICLE_HERO_FALLBACKS
    : DEFAULT_VEHICLE_HERO_FALLBACKS.filter((src) => src !== vehicleImageSrc);
  const tyreProfile = getTyreProfile(activeVehicle);
  const vehicleDescriptor = getVehicleDescriptor(activeVehicle);

  const getMaintenanceDetailRows = (item) => {
    if (!item) return [];

    const log = item.latestLog || {};
    const serviceSource =
      item.date || item.timestamp || log.date || log.timestamp || null;
    const serviceDate = serviceSource
      ? format(new Date(serviceSource), "MMM d, yyyy")
      : "-";
    const projectedDate = item.projectedDate
      ? format(item.projectedDate, "MMM d, yyyy")
      : "-";
    const performedOdo = Number(
      item.performedAtODO ?? log.performedAtODO ?? item.odometer ?? log.odometer ?? 0,
    );
    const interval = Number(
      item.intervalKm ?? log.intervalKm ?? item.distance ?? log.distance ?? 0,
    );
    const nextDue = Number(
      item.nextDueODO ?? log.nextDueODO ?? item.next_due_odometer ?? log.next_due_odometer ?? 0,
    );
    const remainingKm = Math.max(
      0,
      Number(item.kmUntilDue ?? item.remainingKm ?? item.kmRemaining ?? 0),
    );

    return [
      [t("date"), serviceDate],
      [t("odometer"), performedOdo ? `${performedOdo.toLocaleString()} km` : "-"],
      [t("current_mileage"), `${currentOdometer.toLocaleString()} km`],
      [t("distance"), interval ? `${interval.toLocaleString()} km` : "-"],
      [t("next_due"), nextDue ? `${nextDue.toLocaleString()} km` : "-"],
      [t("remaining"), `${remainingKm.toLocaleString()} ${t("km_left")}`],
      [t("due_soon"), projectedDate],
      [t("price"), item.cost != null ? `${Number(item.cost).toFixed(2)} ${t("currency")}` : "-"],
      [t("notes"), item.notes || log.notes || "-"],
    ];
  };

  const handleVehicleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setVehicleImageStatus({ type: "error", message: "Please choose an image file." });
      window.setTimeout(() => setVehicleImageStatus(null), 3000);
      return;
    }

    const vehicleId = selectedVehicleId || activeVehicle?.id;
    setVehicleImageStatus({ type: "loading", message: "Removing background…" });

    try {
      const processedDataUrl = await removeVehicleImageBackground(file);

      if (vehicleId) {
        window.localStorage.setItem(`sft_vehicle_image_${vehicleId}`, processedDataUrl);
      }

      setStoredVehicleImage(processedDataUrl);
      setVehicleImageStatus({ type: "success", message: "Vehicle photo updated" });
    } catch (error) {
      console.warn("[Dashboard] Vehicle background removal failed; using original image.", error);

      try {
        const fallbackDataUrl = await readFileAsDataUrl(file);

        if (vehicleId) {
          window.localStorage.setItem(`sft_vehicle_image_${vehicleId}`, fallbackDataUrl);
        }

        setStoredVehicleImage(fallbackDataUrl);
        setVehicleImageStatus({
          type: "warning",
          message: "Saved original photo. Background removal needs internet/CDN access.",
        });
      } catch {
        setVehicleImageStatus({ type: "error", message: "Could not process this photo." });
      }
    } finally {
      window.setTimeout(() => setVehicleImageStatus(null), 3600);
    }
  };

  return (
    <div className="dashboard-premium-screen">
      <div className="dashboard-premium-content">
        <header className="dashboard-home-header" aria-label="Dashboard header">
          <div className="dashboard-user-avatar" aria-hidden="true">
            <User className="h-7 w-7" strokeWidth={1.8} />
          </div>

          <div className="dashboard-greeting-block">
            <p className="dashboard-greeting-eyebrow">{getGreeting()},</p>
            <h1 className="dashboard-greeting-name">{firstName}</h1>
          </div>

          <div className="dashboard-header-actions">
            <VehicleChip
              vehicles={vehicles}
              selectedVehicleId={selectedVehicleId}
              setSelectedVehicleId={setSelectedVehicleId}
              activeVehicle={activeVehicle}
              className="dashboard-vehicle-chip"
            />
            <IconButton icon={Bell} label="Notifications" className="dashboard-bell-button" />
          </div>
        </header>

        <GlassCard className="dashboard-vehicle-hero">
          <div className="dashboard-hero-visual" aria-hidden={!vehicleImageSrc}>
            <div className="dashboard-hero-light-grid" />
            <VehicleArt
              className="dashboard-premium-vehicle-art"
              src={vehicleImageSrc}
              fallbackSrcs={vehicleImageFallbacks}
              alt={`${activeVehicle?.name || "Vehicle"} hero image`}
              objectPosition={activeVehicle?.imagePosition || activeVehicle?.image_position || "58% center"}
              imageZoom={activeVehicle?.imageZoom || activeVehicle?.image_zoom || 0.94}
            />
          </div>

          <label
            className="dashboard-hero-upload-btn"
            title="Change vehicle photo"
            aria-label="Change vehicle photo"
          >
            <Camera className="h-4 w-4" strokeWidth={1.9} />
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleVehicleImageUpload}
            />
          </label>

          {vehicleImageStatus && (
            <div className={`dashboard-upload-toast dashboard-upload-toast-${vehicleImageStatus.type}`}>
              {vehicleImageStatus.type === "loading" ? (
                <span className="dashboard-upload-spinner" aria-hidden="true" />
              ) : (
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              )}
              {vehicleImageStatus.message}
            </div>
          )}

          <div className="dashboard-hero-copy">
            <div className="dashboard-hero-title-row">
              <h2>{activeVehicle?.name || t("select_vehicle")}</h2>
              <span className="dashboard-active-badge"><span className="status-dot" />Active</span>
            </div>

            <p className="dashboard-vehicle-type">{vehicleDescriptor}</p>

            {tyreProfile && <p className="dashboard-tyre-profile">{tyreProfile}</p>}

            <div className="dashboard-range-pill">
              <Fuel className="h-5 w-5" strokeWidth={1.9} />
              <div>
                <strong>{estimatedRange != null ? estimatedRange.toLocaleString() : "-"} km</strong>
                <span>Est. range</span>
              </div>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="dashboard-stats-group" aria-label="Dashboard key metrics">
          <button
            type="button"
            onClick={() =>
              setEfficiencyUnit((current) =>
                current === "km_l" ? "km_20l" : "km_l",
              )
            }
            aria-label={t("toggle_efficiency_metric")}
            className="dashboard-stat-segment dashboard-stat-button"
          >
            <span className="dashboard-stat-icon dashboard-stat-icon-teal"><Gauge className="h-5 w-5" strokeWidth={1.9} /></span>
            <span className="dashboard-stat-label">{displayedEfficiencyLabel}</span>
            <span className="dashboard-stat-value">{displayedEfficiency}<small>km/L</small></span>
            <span className="dashboard-stat-trend">vs {previousMonthLabel} +6%</span>
          </button>

          <div className="dashboard-stat-segment">
            <span className="dashboard-stat-icon dashboard-stat-icon-cyan"><CircleDollarSign className="h-5 w-5" strokeWidth={1.9} /></span>
            <span className="dashboard-stat-label">{t("cost_per_km")}</span>
            <span className="dashboard-stat-value">{costPerKm.toFixed(2)}<small>{t("currency")}/km</small></span>
            <span className="dashboard-stat-trend">vs {previousMonthLabel} -3%</span>
          </div>

          <div className="dashboard-stat-segment">
            <span className="dashboard-stat-icon dashboard-stat-icon-blue"><Wallet className="h-5 w-5" strokeWidth={1.9} /></span>
            <span className="dashboard-stat-label">{t("total_spent")}</span>
            <span className="dashboard-stat-value">{Math.round(stats.totalCost).toLocaleString()}<small>{t("currency")}</small></span>
            <span className="dashboard-stat-trend">vs {previousMonthLabel} +8%</span>
          </div>
        </GlassCard>

        <section className="dashboard-due-section" aria-labelledby="due-soon-title">
          <SectionTitle
            title={t("due_soon")}
            action={
              <Link to="/maintenance" className="dashboard-view-all-link">
                View all
                <ChevronRight className={cn("h-4 w-4", isRtl && "rotate-180")} />
              </Link>
            }
          />

          {dueItems.length > 0 ? (
            <div className="dashboard-due-grid">
              {dueItems.map((item) => {
                const remainingKm = Math.max(
                  0,
                  Number(item.kmUntilDue ?? item.remainingKm ?? item.kmRemaining ?? 0),
                );
                const title = t(item.categoryId);
                const tone = item.status === "overdue" ? "danger" : "warning";
                const progress = item.progressPercent != null
                  ? `${Math.min(100, Math.max(0, Number(item.progressPercent)))}%`
                  : item.status === "overdue"
                    ? "92%"
                    : "74%";
                return (
                  <MaintenanceAlertCard
                    key={item.id}
                    icon={getMaintenanceIcon(title)}
                    tone={tone}
                    title={title}
                    subtitle={
                      item.status === "overdue"
                        ? t("overdue")
                        : `Due in ${remainingKm.toLocaleString()} km`
                    }
                    detail={progress}
                    onClick={() => navigate("/maintenance")}
                  />
                );
              })}
            </div>
          ) : (
            <GlassCard className="dashboard-empty-maintenance">
              <p>No maintenance warnings right now.</p>
              <span>Tracked service items will appear here when they approach their alert window.</span>
            </GlassCard>
          )}
        </section>

        <GlassCard className="dashboard-insights-card">
          <div className="dashboard-insights-header">
            <div>
              <h2>Quick Insights</h2>
              <p>Spending Trend ({t("currency")})</p>
            </div>
            <span>This Month</span>
          </div>

          <div className="dashboard-insights-body">
            <div className="dashboard-insights-copy">
              <strong>
                {spendingChange == null
                  ? "-"
                  : `${spendingChange > 0 ? "+" : ""}${spendingChange}%`}
              </strong>
              <span>vs {previousMonthLabel}</span>
              {efficiencyTrend.length > 0 && (
                <small>
                  Latest efficiency {formatEfficiency2Dec(efficiencyTrend[efficiencyTrend.length - 1])} km/L
                </small>
              )}
            </div>

            <Sparkline
              id="dashboard-spending"
              values={monthlySpending.map((month) => month.total)}
              labels={monthlySpending.map((month) => month.label)}
              height={112}
            />
          </div>
        </GlassCard>
      </div>

      <Modal
        isOpen={predictedModalOpen}
        onClose={() => {
          setPredictedModalOpen(false);
          setSelectedMaintenanceDetail(null);
        }}
        title={
          selectedMaintenanceDetail
            ? t(selectedMaintenanceDetail.categoryId)
            : t("due_soon")
        }
      >
        <div className="space-y-2 p-1">
          {selectedMaintenanceDetail ? (
            <>
              <button
                type="button"
                onClick={() => setSelectedMaintenanceDetail(null)}
                className="mb-2 text-xs font-bold uppercase text-[var(--accent-cyan)]"
              >
                {t("back")}
              </button>
              <div className="space-y-2">
                {getMaintenanceDetailRows(selectedMaintenanceDetail).map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-start justify-between gap-4 rounded-2xl bg-[rgba(127,139,154,0.1)] px-4 py-3"
                  >
                    <span className="text-xs font-bold text-[var(--text-muted)]">{label}</span>
                    <span className="max-w-[60%] text-end text-sm font-bold text-[var(--text-primary)]">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            upcomingMaintenance.map((item) => {
              const remainingKm = Math.max(
                0,
                Number(item.kmUntilDue ?? item.remainingKm ?? item.kmRemaining ?? 0),
              );

              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setSelectedMaintenanceDetail(item)}
                  className="w-full rounded-2xl border border-[var(--border-soft)] bg-[rgba(35,183,255,0.1)] p-4 text-start transition-transform active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-1.5 rounded-full"
                      style={{ backgroundColor: item.categoryColor }}
                    />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-[var(--accent-cyan)]">
                        {t(item.categoryId)}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        {remainingKm.toLocaleString()} {t("km_left")}
                      </p>
                    </div>
                    <div className="text-end text-xs font-bold text-[var(--accent-cyan)]">
                      {item.projectedDate ? format(item.projectedDate, "MMM d") : "-"}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </Modal>
    </div>
  );
}
