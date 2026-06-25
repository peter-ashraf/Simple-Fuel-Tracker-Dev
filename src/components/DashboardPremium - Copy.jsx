import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  Bell,
  ChevronRight,
  CircleDollarSign,
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
  ScreenHeader,
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

  const efficiencyTrend = useMemo(() => {
    if (activeVehicleFillUps.length < 2) return [];
    const points = [];
    for (let i = 1; i < activeVehicleFillUps.length; i += 1) {
      const metrics = calculateTripMetrics(activeVehicleFillUps, i);
      if (metrics.kmPerLiter > 0) points.push(metrics.kmPerLiter);
    }
    return points.slice(-8);
  }, [activeVehicleFillUps]);

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

  return (
    <div className="space-y-6 pb-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[rgba(32,230,183,0.12)] text-[var(--accent-primary)] shadow-[var(--shadow-glow)]">
            <User className="h-7 w-7" strokeWidth={1.8} />
          </div>
          <ScreenHeader
            eyebrow={`${getGreeting()},`}
            title={firstName}
            className="min-w-0"
          />
        </div>

        <div className="flex items-center gap-3">
          <VehicleChip
            vehicles={vehicles}
            selectedVehicleId={selectedVehicleId}
            setSelectedVehicleId={setSelectedVehicleId}
            activeVehicle={activeVehicle}
            className="max-w-[138px]"
          />
          <IconButton icon={Bell} label="Notifications" />
        </div>
      </div>

      <GlassCard className="relative min-h-[260px] overflow-hidden p-0">
          <div className="relative z-10 max-w-[58%] space-y-3 p-5">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-[30px] font-black leading-none tracking-normal text-[var(--text-primary)]">
                  {activeVehicle?.name || t("select_vehicle")}
                </h2>
                <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--accent-primary)]">
                  <span className="status-dot" />
                  Active
                </span>
              </div>
              <p className="mt-3 text-sm font-medium text-[var(--text-secondary)]">
                {activeVehicle?.type === "car" ? "Petrol vehicle" : activeVehicle?.type || "Vehicle"}
              </p>
              {activeVehicle?.tyreSize && (
                <p className="mt-1.5 text-sm font-medium text-[var(--text-secondary)]">
                  {activeVehicle.tyreSize.width}/{activeVehicle.tyreSize.aspectRatio} R
                  {activeVehicle.tyreSize.rimSize}
                </p>
              )}
            </div>

            <div className="inline-flex items-center gap-2 rounded-3xl border border-[var(--border-medium)] bg-[rgba(35,183,255,0.1)] px-3 py-2.5">
              <Fuel className="h-4 w-4 text-[var(--accent-cyan)]" strokeWidth={1.9} />
              <div>
                <p className="text-xl font-black leading-none text-[var(--text-primary)]">
                  {estimatedRange != null ? estimatedRange.toLocaleString() : "-"} km
                </p>
                <p className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">
                  Est. range
                </p>
              </div>
            </div>
          </div>
          <VehicleArt className="absolute bottom-0 right-0 h-[180px] w-[70%]" />
      </GlassCard>

      <GlassCard className="grid grid-cols-3 gap-0 p-2">
        <button
          type="button"
          onClick={() =>
            setEfficiencyUnit((current) =>
              current === "km_l" ? "km_20l" : "km_l",
            )
          }
          aria-label={t("toggle_efficiency_metric")}
          className="min-w-0 px-2 py-1.5 text-start"
        >
          <Gauge className="mb-1.5 h-5 w-5 text-[var(--accent-primary)]" />
          <p className="truncate text-xs font-semibold text-[var(--text-secondary)]">
            {displayedEfficiencyLabel}
          </p>
          <p className="mt-1 text-lg font-black text-[var(--text-primary)]">
            {displayedEfficiency}
            <span className="ms-1 text-xs font-semibold text-[var(--text-secondary)]">km/L</span>
          </p>
        </button>
        <div className="min-w-0 border-x border-[var(--border-soft)] px-2 py-1.5">
          <CircleDollarSign className="mb-1.5 h-5 w-5 text-[var(--accent-cyan)]" />
          <p className="truncate text-xs font-semibold text-[var(--text-secondary)]">
            {t("cost_per_km")}
          </p>
          <p className="mt-1 text-lg font-black text-[var(--text-primary)]">
            {costPerKm.toFixed(2)}
            <span className="ms-1 text-xs font-semibold text-[var(--text-secondary)]">{t("currency")}/km</span>
          </p>
        </div>
        <div className="min-w-0 px-2 py-1.5">
          <Wallet className="mb-1.5 h-5 w-5 text-[var(--accent-blue)]" />
          <p className="truncate text-xs font-semibold text-[var(--text-secondary)]">
            {t("total_spent")}
          </p>
          <p className="mt-1 text-lg font-black leading-none text-[var(--text-primary)]">
            {Math.round(stats.totalCost).toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] font-semibold leading-none text-[var(--text-secondary)]">{t("currency")}</p>
        </div>
      </GlassCard>

      <section className="space-y-4">
        <SectionTitle
          title={t("due_soon")}
          action={
            <Link
              to="/maintenance"
              className="inline-flex items-center gap-2 text-sm font-bold text-[var(--accent-primary)]"
            >
              View all
              <ChevronRight className={cn("h-4 w-4", isRtl && "rotate-180")} />
            </Link>
          }
        />
        {dueItems.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {dueItems.map((item) => {
              const remainingKm = Math.max(
                0,
                Number(item.kmUntilDue ?? item.remainingKm ?? item.kmRemaining ?? 0),
              );
              const tone = item.status === "overdue" ? "danger" : "warning";
              return (
                <MaintenanceAlertCard
                  key={item.id}
                  icon={Wrench}
                  tone={tone}
                  title={t(item.categoryId)}
                  subtitle={
                    item.status === "overdue"
                      ? t("overdue")
                      : `${t("due_soon")} ${remainingKm.toLocaleString()} km`
                  }
                  detail={item.status === "overdue" ? "92%" : "74%"}
                  onClick={() => navigate("/maintenance")}
                />
              );
            })}
          </div>
        ) : (
          <GlassCard className="p-5">
            <p className="text-base font-bold text-[var(--text-primary)]">
              No maintenance warnings right now.
            </p>
            <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">
              Tracked service items will appear here when they approach their alert window.
            </p>
          </GlassCard>
        )}
      </section>

      <GlassCard className="space-y-5 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-[var(--text-primary)]">
              Quick Insights
            </h2>
            <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
              Spending Trend ({t("currency")})
            </p>
          </div>
          <span className="rounded-full border border-[var(--border-soft)] bg-[var(--bg-glass)] px-4 py-2 text-sm font-bold text-[var(--text-secondary)]">
            This Month
          </span>
        </div>
        <div className="grid gap-4 min-[430px]:grid-cols-[0.4fr_0.6fr]">
          <div>
            <p className="text-[42px] font-black leading-none tracking-normal text-[var(--accent-primary)]">
              {spendingChange == null
                ? "-"
                : `${spendingChange > 0 ? "+" : ""}${spendingChange}%`}
            </p>
            <p className="mt-2 text-lg font-semibold text-[var(--text-secondary)]">
              vs May
            </p>
            {efficiencyTrend.length > 0 && (
              <p className="mt-4 text-sm font-bold text-[var(--text-muted)]">
                Latest efficiency {formatEfficiency2Dec(efficiencyTrend[efficiencyTrend.length - 1])}
              </p>
            )}
          </div>
          <Sparkline
            id="dashboard-spending"
            values={monthlySpending.map((month) => month.total)}
            labels={monthlySpending.map((month) => month.label)}
            height={130}
          />
        </div>
      </GlassCard>

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
