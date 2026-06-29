import { lazy, Suspense, useState, useRef, useEffect, useMemo } from "react";
import {
  Routes,
  Route,
  NavLink,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  BarChart3,
  Check,
  ChevronDown,
  Circle,
  Clock3,
  Fuel,
  Home,
  Plus,
  Route as RouteIcon,
  Settings,
  Wrench,
} from "lucide-react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import { useFuel } from "./hooks/useFuelContext";
import { useNotifications } from "./hooks/useNotifications";
import { useTranslation } from "react-i18next";
import { authService } from "./services/authService";
import { CLOUD_CONFIGURED, IS_DEV_BUILD, STORAGE_PREFIX } from "./config/appConfig";
import { calculateAverageDailyDistance } from "./utils/calculations";
import { buildMaintenanceForecast } from "./utils/maintenanceForecast";

// Pages
import Dashboard from "./components/DashboardPremium";
import History from "./components/HistoryPremium";
import FillUpForm from "./components/FillUpFormPremium";
import LoginScreen from "./components/LoginScreen";
import AppUpdatePrompt from "./components/AppUpdatePrompt";

const Analytics = lazy(() => import("./components/AnalyticsPremium"));
const SettingsScreen = lazy(() => import("./components/Settings"));
const TripCostEstimator = lazy(() =>
  import("./components/trips/TripCostEstimatorPremium"),
);
const TyreCalculator = lazy(() => import("./components/TyreCalculatorPremium"));
const Maintenance = lazy(() => import("./components/Maintenance"));
const MaintenanceForm = lazy(() => import("./components/MaintenanceForm"));
const MaintenanceLogEdit = lazy(() =>
  import("./components/MaintenanceLogEdit"),
);
const DataMigrationModal = lazy(() => import("./components/DataMigrationModal"));

const STARTUP_LOCAL_FALLBACK_MS = 800;

const getCloudSyncService = () =>
  import("./services/cloudSyncService").then(
    ({ cloudSyncService }) => cloudSyncService,
  );

const hasLocalFuelData = () => {
  try {
    const readActiveRecords = (key) =>
      JSON.parse(localStorage.getItem(key) || "[]").filter(
        (record) => !record.deletedAt && !record.deleted_at,
      );

    return (
      readActiveRecords("fueltracker-vehicles-v2").length > 0 ||
      readActiveRecords("fueltracker-fillups-v2").length > 0 ||
      readActiveRecords("fueltracker-maintenance-entries-v3").length > 0 ||
      readActiveRecords("fueltracker-trip-estimates-v2").length > 0
    );
  } catch {
    return false;
  }
};

function PageLoading() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function Header() {
  const { vehicles, selectedVehicleId, setSelectedVehicleId } = useFuel();
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const dropdownRef = useRef(null);
  const featuresDropdownRef = useRef(null);

  const isSettings = location.pathname === "/settings";
  const activeVehicle = vehicles.find((v) => v.id === selectedVehicleId);
  const isRtl = i18n.language === "ar";

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
      if (
        featuresDropdownRef.current &&
        !featuresDropdownRef.current.contains(event.target)
      ) {
        setFeaturesOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-black/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/[0.06] px-5 pt-[calc(1rem+env(safe-area-inset-top))] pb-4 flex items-center justify-center">
      <div className="w-full max-w-lg flex items-center justify-between">
        <div className="flex items-center gap-3 relative" ref={dropdownRef}>
          <div className="bg-emerald-500/10 dark:bg-emerald-500/20 p-2 rounded-xl border-0">
            <Fuel
              className="text-emerald-500 dark:text-emerald-400 w-5 h-5 neon-glow"
              strokeWidth={1.9}
            />
          </div>

          <button
            onClick={() => !isSettings && setIsOpen(!isOpen)}
            disabled={isSettings}
            className={`flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white tracking-tight focus:outline-none transition-opacity ${isSettings ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:opacity-80"}`}
          >
            <span>
              {activeVehicle ? activeVehicle.name : t("select_vehicle")}
            </span>
            {!isSettings && (
              <Motion.div
                animate={{ rotate: isOpen ? 180 : 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <ChevronDown
                  className="w-5 h-5 text-slate-400"
                  strokeWidth={2}
                />
              </Motion.div>
            )}
          </button>

          <AnimatePresence>
            {isOpen && !isSettings && (
              <Motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{
                  opacity: 0,
                  y: -10,
                  scale: 0.95,
                  transition: { duration: 0.15 },
                }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className={`absolute top-12 ${isRtl ? "right-0" : "left-12"} w-48 bg-white/95 dark:bg-black/90 backdrop-blur-2xl border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-xl overflow-hidden z-50 origin-top-left`}
              >
                <div className="p-1">
                  {vehicles.map((v) => (
                    <NavLink
                      key={v.id}
                      to="#"
                      onClick={() => {
                        setSelectedVehicleId(v.id);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-semibold rounded-xl transition-colors ${selectedVehicleId === v.id ? "bg-emerald-500 text-white" : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]"}`}
                    >
                      <span className="truncate">{v.name}</span>
                      {selectedVehicleId === v.id && (
                        <Check className="w-4 h-4" />
                      )}
                    </NavLink>
                  ))}
                </div>
              </Motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Additional Features Dropdown */}
        <div className="relative" ref={featuresDropdownRef}>
          <button
            onClick={() => setFeaturesOpen(!featuresOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.08] rounded-xl transition-colors border-0"
          >
            <Wrench className="w-4 h-4" strokeWidth={1.9} />
            <span className="hidden sm:inline">{t("tools")}</span>
            <Motion.div
              animate={{ rotate: featuresOpen ? 180 : 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <ChevronDown className="w-4 h-4" strokeWidth={2} />
            </Motion.div>
          </button>

          <AnimatePresence>
            {featuresOpen && (
              <Motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{
                  opacity: 0,
                  y: -10,
                  scale: 0.95,
                  transition: { duration: 0.15 },
                }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className={`absolute top-10 ${isRtl ? "left-0" : "right-0"} w-52 bg-white/95 dark:bg-black/90 backdrop-blur-2xl border border-slate-200/50 dark:border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden z-50 origin-top-right`}
              >
                <div className="p-1 space-y-0.5">
                  <NavLink
                    to="/trip-estimator"
                    onClick={() => setFeaturesOpen(false)}
                    className={({ isActive }) =>
                      `w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold rounded-xl transition-colors ${isActive ? "bg-emerald-500 text-white" : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]"}`
                    }
                  >
                    <RouteIcon className="w-4 h-4" strokeWidth={1.9} />
                    {t("trip_estimator")}
                  </NavLink>
                  <NavLink
                    to="/tyre-calculator"
                    onClick={() => setFeaturesOpen(false)}
                    className={({ isActive }) =>
                      `w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold rounded-xl transition-colors ${isActive ? "bg-emerald-500 text-white" : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]"}`
                    }
                  >
                    <Circle className="w-4 h-4" strokeWidth={1.9} />
                    {t("tyre_size")}
                  </NavLink>
                  <NavLink
                    to="/maintenance"
                    onClick={() => setFeaturesOpen(false)}
                    className={({ isActive }) =>
                      `w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold rounded-xl transition-colors ${isActive ? "bg-emerald-500 text-white" : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]"}`
                    }
                  >
                    <Wrench className="w-4 h-4" strokeWidth={1.9} />
                    {t("maintenance")}
                  </NavLink>
                </div>
              </Motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const cn = (...classes) => classes.filter(Boolean).join(" ");

  // Auth state
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [localMode, setLocalMode] = useState(false);
  const [userId, setUserId] = useState(null);

  // Migration modal state
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [migrationLoadingAction, setMigrationLoadingAction] = useState(null);
  const [migrationResult, setMigrationResult] = useState(null);

  // Check for due maintenance reminders on app open
  const {
    maintenanceEntries,
    activeVehicleFillUps,
    categories,
    maintenanceSettings,
  } = useFuel();
  const { checkMaintenanceReminders } = useNotifications();
  const currentOdometer =
    activeVehicleFillUps.length > 0
      ? activeVehicleFillUps[activeVehicleFillUps.length - 1].odometer
      : 0;
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
      }).filter((item) => item.isTracked),
    [
      avgDailyDistance,
      categories,
      currentOdometer,
      maintenanceEntries,
      maintenanceSettings,
    ],
  );

  useEffect(() => {
    // Single-flight initialization guard:
    // checkSession handles the initial sync on app load.
    // The onAuthStateChange listener is only allowed to run sync
    // for explicit SIGNED_IN events that happen AFTER the initial load.
    let startupInitDone = false;
    let cancelled = false;
    let startupResolved = false;

    const fallbackTimer = setTimeout(() => {
      if (!startupResolved && hasLocalFuelData()) {
        setLocalMode(true);
        setLoading(false);
      }
    }, STARTUP_LOCAL_FALLBACK_MS);

    const runSync = async (session) => {
      if (!session) return;

      try {
        const cloudSyncService = await getCloudSyncService();
        const status = await cloudSyncService.initialize();

        if (status) {
          const migrationComplete =
            localStorage.getItem("fueltracker-migration-complete") === "true";
          const migrationDecision = localStorage.getItem(
            "fueltracker-migration-decision",
          );

          const countsMatch =
            status.localCounts?.vehicles === status.cloudCounts?.vehicles &&
            status.localCounts?.fillups === status.cloudCounts?.fillups &&
            status.localCounts?.maintenance === status.cloudCounts?.maintenance;

          const hasConflicts = status.detailedDiff?.conflicts?.length > 0;

          const shouldShowModal =
            !migrationComplete &&
            !migrationDecision &&
            (!countsMatch || hasConflicts);

          setSyncStatus(status);
          setShowMigrationModal(shouldShowModal);
        } else {
          setSyncStatus(null);
          setShowMigrationModal(false);
        }
      } catch (error) {
        console.error("[App][sync] Sync initialization error:", error);
        setSyncStatus(null);
        setShowMigrationModal(false);
      }
    };

    const checkSession = async () => {
      if (!navigator.onLine && hasLocalFuelData()) {
        startupResolved = true;
        clearTimeout(fallbackTimer);
        setLocalMode(true);
        setLoading(false);
        startupInitDone = true;
        return;
      }

      const currentSession = await authService.getSession();
      if (cancelled) return;

      startupResolved = true;
      clearTimeout(fallbackTimer);
      setSession(currentSession);
      setLocalMode(!currentSession && !navigator.onLine && hasLocalFuelData());
      setLoading(false);

      if (currentSession) {
        getCloudSyncService().then((cloudSyncService) =>
          cloudSyncService.getUserId().then((fetchedUserId) => {
            if (!cancelled) setUserId(fetchedUserId);
          }),
        );

        runSync(currentSession).finally(() => {
          startupInitDone = true;
        });
      } else {
        startupInitDone = true;
      }
    };

    checkSession();

    const subscription = authService.onAuthStateChange(
      async (event, currentSession) => {
        setSession(currentSession);

        // INITIAL_SESSION fires immediately on subscribe and overlaps with
        // checkSession. We skip it here because checkSession handles it.
        if (event === "INITIAL_SESSION") return;

        if (event === "SIGNED_IN" && currentSession) {
          setLocalMode(false);
          navigate("/", { replace: true });

          // Only run if startup is already complete; otherwise checkSession
          // handles it. This guards against near-simultaneous events.
          if (!startupInitDone) {
            return;
          }

          // Fetch userId on sign-in
          const cloudSyncService = await getCloudSyncService();
          const fetchedUserId = await cloudSyncService.getUserId();
          setUserId(fetchedUserId);

          await runSync(currentSession);
        }

        if (event === "SIGNED_OUT") {
          startupInitDone = false;
          setUserId(null);
          setLocalMode(!navigator.onLine && hasLocalFuelData());
        }
      },
    );

    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleMigrationDecision = async (decision) => {
    if (migrationLoading) return null;

    setMigrationLoading(true);
    setMigrationLoadingAction(decision);
    setMigrationResult(null);

    try {
      const cloudSyncService = await getCloudSyncService();
      const userId = await cloudSyncService.getUserId();
      const result = await cloudSyncService.continueSyncAfterDecision(
        userId,
        decision,
      );

      if (result?.needsResolution) {
        setSyncStatus(result);
        return result;
      }

      setMigrationResult(result);
      return result;
    } catch (error) {
      console.error("[Sync][handleMigrationDecision] decision failed:", error);

      const failureResult = {
        success: false,
        action: decision,
        message: "Migration failed: " + error.message,
      };

      setMigrationResult(failureResult);
      return failureResult;
    } finally {
      setMigrationLoading(false);
    }
  };

  const handleMigrationResultClose = () => {
  if (migrationResult?.success) {
    const vehicles = JSON.parse(localStorage.getItem("vehicles") || "[]");
    const currentSelectedVehicleId =
      localStorage.getItem("selectedVehicleId");

    if (
      vehicles.length > 0 &&
      !vehicles.some((v) => v.id === currentSelectedVehicleId)
    ) {
      localStorage.setItem("selectedVehicleId", vehicles[0].id);
    }

    setShowMigrationModal(false);
    setMigrationResult(null);
    navigate("/");
    window.location.reload();
    return;
  }

  setMigrationResult(null);
};

  const handleMigrationRetry = () => {
    if (migrationResult?.action) {
      handleMigrationDecision(migrationResult.action);
    }
  };

  const handleMigrationCancel = () => {
    setShowMigrationModal(false);
    setSyncStatus(null);
  };

  useEffect(() => {
    // Check for due reminders (with a small delay to ensure everything is loaded)
    const timer = setTimeout(() => {
      checkMaintenanceReminders(maintenanceForecast, currentOdometer);
    }, 2000);

    return () => clearTimeout(timer);
  }, [checkMaintenanceReminders, currentOdometer, maintenanceForecast]);

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-black">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!session && !localMode) {
    return <LoginScreen />;
  }

  const primaryRoutes = ["/", "/history", "/add", "/analytics", "/settings"];
  const isPrimaryRoute = primaryRoutes.includes(location.pathname);
  const isDashboardRoute = location.pathname === "/";
  const isFillUpRoute = location.pathname === "/add";
  const isHistoryRoute = location.pathname === "/history";
  const isAnalyticsRoute = location.pathname === "/analytics";
  const isSettingsRoute = location.pathname === "/settings";
  const isToolRoute =
    location.pathname.startsWith("/trip-estimator") ||
    location.pathname.startsWith("/tyre-calculator");
  const showLegacyHeader = !isPrimaryRoute && !isToolRoute;
  const showBottomNav =
    location.pathname !== "/add" &&
    !location.pathname.startsWith("/trip-estimator") &&
    !location.pathname.startsWith("/tyre-calculator");

  return (
    <div
      className={cn(
        "app-shell mx-auto relative overflow-hidden flex flex-col transition-colors duration-300",
        isDashboardRoute
          ? "dashboard-app-shell"
          : isFillUpRoute
            ? "fillup-app-shell"
            : isHistoryRoute
              ? "history-app-shell"
              : isAnalyticsRoute
                ? "analytics-app-shell"
                : isSettingsRoute
                  ? "settings-app-shell"
                  : isToolRoute
                    ? "tool-app-shell"
                    : "max-w-lg",
      )}
    >
      {showLegacyHeader && <Header />}
      {IS_DEV_BUILD && (
        <div
          className={cn(
            "dev-badge fixed left-1/2 z-50 -translate-x-1/2 px-3 py-1 text-[10px] font-black uppercase tracking-widest",
            showLegacyHeader
              ? "top-[calc(4.5rem+env(safe-area-inset-top))]"
              : "top-[calc(0.75rem+env(safe-area-inset-top))]",
          )}
        >
          {CLOUD_CONFIGURED ? "Dev cloud mode" : "Dev local mode"} - {STORAGE_PREFIX}
        </div>
      )}

      <main
        className={cn(
          "flex-1 min-h-0 overscroll-contain",
          isDashboardRoute
            ? "dashboard-route-main overflow-hidden p-0"
            : isFillUpRoute
              ? "fillup-route-main overflow-y-auto p-0"
              : isHistoryRoute
                ? "history-route-main overflow-hidden p-0"
                : isAnalyticsRoute
                  ? "analytics-route-main overflow-hidden p-0"
                : isSettingsRoute
                  ? "settings-route-main overflow-hidden p-0"
                  : isToolRoute
                    ? "tool-route-main overflow-y-auto p-0"
                    : "overflow-y-auto px-4",
          !isDashboardRoute &&
            !isFillUpRoute &&
            !isHistoryRoute &&
            !isAnalyticsRoute &&
            !isSettingsRoute &&
            !isToolRoute &&
            (showLegacyHeader
              ? "pt-[calc(5rem+env(safe-area-inset-top))]"
              : "pt-[calc(2.5rem+env(safe-area-inset-top))]"),
          !isDashboardRoute &&
            !isFillUpRoute &&
            !isHistoryRoute &&
            !isAnalyticsRoute &&
            !isToolRoute &&
            (showBottomNav
              ? "pb-[calc(7rem+env(safe-area-inset-bottom))]"
              : "pb-[calc(2.5rem+env(safe-area-inset-bottom))]"),
        )}
      >
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/history" element={<History />} />
            <Route path="/add" element={<FillUpForm />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/trip-estimator" element={<TripCostEstimator />} />
            <Route path="/tyre-calculator" element={<TyreCalculator />} />
            <Route path="/maintenance" element={<Maintenance />} />
            <Route path="/maintenance/add" element={<MaintenanceForm />} />
            <Route
              path="/maintenance/edit/:id"
              element={<MaintenanceLogEdit />}
            />
            <Route path="/settings" element={<SettingsScreen />} />
          </Routes>
        </Suspense>
      </main>

      {showBottomNav && (
        <nav className="bottom-nav-shell" aria-label="Primary navigation">
          <div className="bottom-nav">
            <NavLink
              to="/"
              className={({ isActive }) => cn("nav-item", isActive && "active")}
            >
              <Motion.span whileTap={{ scale: 0.86 }} className="nav-item-inner">
                <Home className="h-6 w-6" strokeWidth={1.9} />
                <span>{t("dashboard")}</span>
              </Motion.span>
            </NavLink>

            <NavLink
              to="/history"
              className={({ isActive }) => cn("nav-item", isActive && "active")}
            >
              <Motion.span whileTap={{ scale: 0.86 }} className="nav-item-inner">
                <Clock3 className="h-6 w-6" strokeWidth={1.9} />
                <span>{t("history")}</span>
              </Motion.span>
            </NavLink>

            <NavLink
              to={location.pathname.startsWith("/maintenance") ? "/maintenance/add" : "/add"}
              className="nav-add"
              aria-label={t("add_fillup")}
            >
              <Motion.span
                whileTap={{ scale: 0.9, rotate: 90 }}
                transition={{ type: "spring", stiffness: 400, damping: 12 }}
              >
                <Plus className="h-9 w-9" strokeWidth={2.5} />
              </Motion.span>
            </NavLink>

            <NavLink
              to="/analytics"
              className={({ isActive }) => cn("nav-item", isActive && "active")}
            >
              <Motion.span whileTap={{ scale: 0.86 }} className="nav-item-inner">
                <BarChart3 className="h-6 w-6" strokeWidth={1.9} />
                <span>{t("analytics")}</span>
              </Motion.span>
            </NavLink>

            <NavLink
              to="/settings"
              className={({ isActive }) => cn("nav-item", isActive && "active")}
            >
              <Motion.span whileTap={{ scale: 0.86 }} className="nav-item-inner">
                <Settings className="h-6 w-6" strokeWidth={1.9} />
                <span>{t("settings")}</span>
              </Motion.span>
            </NavLink>
          </div>
        </nav>
      )}

      {/* Data Migration Modal */}
      <AnimatePresence>
        {(showMigrationModal || migrationResult) && (
          <Suspense fallback={null}>
            <DataMigrationModal
              syncStatus={syncStatus}
              onDecision={handleMigrationDecision}
              onCancel={handleMigrationCancel}
              loading={migrationLoading}
              loadingAction={migrationLoadingAction}
              result={migrationResult}
              onCloseResult={handleMigrationResultClose}
              onRetry={handleMigrationRetry}
              disableClose={migrationLoading}
              userId={userId}
            />
          </Suspense>
        )}
      </AnimatePresence>

      <AppUpdatePrompt />
    </div>
  );
}
