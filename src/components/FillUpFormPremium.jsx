import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  MapPin,
  Save,
  Wrench,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFuel } from "../hooks/useFuelContext";
import { useLocationDetection } from "../hooks/useLocationDetection";
import { useNotifications } from "../hooks/useNotifications";
import { gasStationService } from "../services/gasStationService";
import { DateInput } from "./DateInput";
import { StationSuggestion } from "./StationSuggestion";
import {
  ConfirmModal,
  FuelGaugeSlider,
  Input,
  Label,
  cn,
} from "./ui";
import {
  GlassCard,
  MaintenanceAlertCard,
  ScreenHeader,
  SegmentedControl,
} from "./PremiumUI";
import { calculateTripMetrics } from "../utils/calculations";

export default function FillUpFormPremium() {
  const {
    fuelPrices,
    addFillUp,
    activeVehicleFillUps,
    addMaintenanceEntry,
    maintenanceEntries,
    activeVehicle,
    getCategoryById,
  } = useFuel();
  const navigate = useNavigate();
  useNotifications();
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language.startsWith("ar");
  const { location, permissionState, getCurrentLocation, requestPermission } =
    useLocationDetection();

  const [stations, setStations] = useState([]);
  const [showStationModal, setShowStationModal] = useState(false);
  const [stationLoading, setStationLoading] = useState(false);
  const [stationError, setStationError] = useState(null);
  const [convertModal, setConvertModal] = useState({
    isOpen: false,
    noteData: null,
  });
  const [validationError, setValidationError] = useState("");
  const [warningModal, setWarningModal] = useState({
    isOpen: false,
    message: "",
    entry: null,
  });

  const [liters, setLiters] = useState("");
  const [moneySpent, setMoneySpent] = useState("");
  const [lastEditedField, setLastEditedField] = useState(null);
  const [odometer, setOdometer] = useState("");
  const [selectedFuelType, setSelectedFuelType] = useState("92");
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
  const [station, setStation] = useState("");
  const [notes, setNotes] = useState("");
  const [tankLevelAfter, setTankLevelAfter] = useState(100);

  useEffect(() => {
    if (activeVehicleFillUps.length > 0 && !odometer) {
      setOdometer(String(activeVehicleFillUps[activeVehicleFillUps.length - 1].odometer));
    }
  }, [activeVehicleFillUps, odometer]);

  useEffect(() => {
    if (lastEditedField === "liters" && liters && fuelPrices[selectedFuelType]) {
      setMoneySpent((Number(liters) * fuelPrices[selectedFuelType]).toFixed(2));
    } else if (
      lastEditedField === "moneySpent" &&
      moneySpent &&
      fuelPrices[selectedFuelType]
    ) {
      setLiters((Number(moneySpent) / fuelPrices[selectedFuelType]).toFixed(2));
    }
  }, [liters, moneySpent, selectedFuelType, fuelPrices, lastEditedField]);

  const handleDetectStation = async () => {
    try {
      if (permissionState === "denied") {
        const granted = await requestPermission();
        if (!granted) return;
      }
      const locationData = await getCurrentLocation();
      if (!locationData) return;
      setStationLoading(true);
      const nearbyStations = await gasStationService.findNearbyGasStations(
        locationData.latitude,
        locationData.longitude,
      );
      setStations(nearbyStations);
    } catch (error) {
      setStationError(error.message);
    } finally {
      setStationLoading(false);
    }
  };

  const handleStationSelect = (selectedStation) => {
    setStation(selectedStation.name);
    setShowStationModal(false);
  };

  const handleAddUserStation = async (stationName) => {
    if (!location) return;
    try {
      gasStationService.saveUserStation(stationName, location.latitude, location.longitude);
      setStation(stationName);
      setShowStationModal(false);
      gasStationService.clearCache();
    } catch (error) {
      console.error(error);
    }
  };

  const handleConvertToMaintenanceLog = () =>
    setConvertModal({ isOpen: true, noteData: notes.trim() });

  const confirmConvertToMaintenanceLog = () => {
    if (convertModal.noteData) {
      addMaintenanceEntry({
        type: "general_inspection",
        performedAtODO: odometer ? Number(odometer) : 0,
        intervalKm: 0,
        notes: convertModal.noteData,
      });
      setNotes("");
      setConvertModal({ isOpen: false, noteData: null });
    }
  };

  const findOdometerNeighbors = (entryDate) => {
    const entryTime = entryDate.getTime();
    const sorted = [...activeVehicleFillUps].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    let previous = null;
    let next = null;

    sorted.forEach((fill) => {
      const fillTime = new Date(fill.timestamp).getTime();
      if (fillTime <= entryTime) previous = fill;
      if (!next && fillTime > entryTime) next = fill;
    });

    return { previous, next };
  };

  const buildFillUpEntry = () => {
    const newOdometer = Number(odometer);
    const newDate = new Date(date);
    const now = new Date();
    newDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

    return {
      date,
      timestamp: newDate.toISOString(),
      fuelType: selectedFuelType,
      liters: Number(liters) || 0,
      odometer: newOdometer,
      pricePerLiter: Number(fuelPrices[selectedFuelType] || 0),
      station: station.trim(),
      notes: notes.trim(),
      tankLevelAfter,
      tankCapacityLiters: activeVehicle?.tankCapacity || null,
      isPartialFill: tankLevelAfter < 100,
    };
  };

  const validateEntry = (entry) => {
    if (!activeVehicle) return t("no_vehicle_selected");
    if (!entry.date || Number.isNaN(new Date(entry.timestamp).getTime())) {
      return t("invalid_date");
    }
    if (new Date(entry.timestamp).getTime() > Date.now() + 60 * 1000) {
      return t("future_date_error");
    }
    if (!Number.isFinite(entry.odometer) || entry.odometer <= 0) {
      return t("invalid_odometer");
    }
    if (!Number.isFinite(entry.liters) || entry.liters <= 0) {
      return t("invalid_liters");
    }
    if (!Number.isFinite(entry.pricePerLiter) || entry.pricePerLiter <= 0) {
      return t("invalid_fuel_price");
    }

    const { previous, next } = findOdometerNeighbors(new Date(entry.timestamp));

    if (previous && entry.odometer <= Number(previous.odometer)) {
      return t("odometer_must_increase", {
        value: Number(previous.odometer).toLocaleString(),
      });
    }

    if (next && entry.odometer >= Number(next.odometer)) {
      return t("odometer_must_be_below_next", {
        value: Number(next.odometer).toLocaleString(),
      });
    }

    return "";
  };

  const getEntryWarning = (entry) => {
    const { previous } = findOdometerNeighbors(new Date(entry.timestamp));
    if (!previous) return "";

    const metrics = calculateTripMetrics([previous, entry], 1);
    if (metrics.distance <= 0 || metrics.kmPerLiter <= 0) return "";

    if (metrics.kmPerLiter < 4 || metrics.kmPerLiter > 30) {
      return t("suspicious_efficiency_warning", {
        value: metrics.kmPerLiter.toFixed(2),
      });
    }

    return "";
  };

  const saveEntry = async (entry) => {
    await addFillUp(entry);
    navigate("/");
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const entry = buildFillUpEntry();
    const error = validateEntry(entry);
    if (error) {
      setValidationError(error);
      return;
    }

    setValidationError("");
    const warning = getEntryWarning(entry);

    if (warning) {
      setWarningModal({ isOpen: true, message: warning, entry });
      return;
    }

    saveEntry(entry);
  };

  const activeAlerts = maintenanceEntries.filter((entry) => {
    if (!entry.nextDueODO || !entry.alertODO) return false;
    const currentOdo =
      activeVehicleFillUps.length > 0
        ? activeVehicleFillUps[activeVehicleFillUps.length - 1].odometer
        : 0;
    return currentOdo >= entry.alertODO;
  });

  return (
    <>
      <div className="space-y-6 pb-4">
        <div className="grid grid-cols-[52px_1fr_52px] items-start gap-3">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="icon-button"
            aria-label={t("back")}
          >
            <ChevronLeft className={cn("h-7 w-7", isRtl && "rotate-180")} />
          </button>
          <ScreenHeader
            title={t("add_fillup")}
            subtitle={
              <span className="inline-flex items-center justify-center gap-3">
                {activeVehicle?.name || t("select_vehicle")}
                <span className="status-dot" />
                <span className="text-[var(--accent-primary)]">Active</span>
              </span>
            }
            centered
          />
          <div />
        </div>

        <form id="fillup-form" onSubmit={handleSubmit} className="space-y-5">
          {validationError && (
            <div className="flex items-start gap-3 rounded-3xl border border-red-500/20 bg-red-500/10 p-4 text-sm font-bold text-red-300">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          <GlassCard className="space-y-5 p-5">
            <div>
              <Label>{t("date")}</Label>
              <div className="relative">
                <DateInput value={date} onChange={setDate} required />
                <CalendarDays className="pointer-events-none absolute end-5 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--accent-primary)]" />
              </div>
            </div>

            <div className="form-grid-2">
              <div>
                <Label>{t("odometer")} (km)</Label>
                <Input
                  type="number"
                  value={odometer}
                  onChange={(event) => setOdometer(event.target.value)}
                  placeholder="179566"
                  required
                  min="0"
                />
              </div>
              <div>
                <Label>{t("liters")} (L)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={liters}
                  onChange={(event) => {
                    setLastEditedField("liters");
                    setLiters(event.target.value);
                  }}
                  placeholder="45.5"
                />
              </div>
            </div>

            <div>
              <Label>{t("fuel_type")}</Label>
              <SegmentedControl
                name="fillup-fuel"
                value={selectedFuelType}
                onChange={setSelectedFuelType}
                options={[
                  { value: "92", label: "92" },
                  { value: "95", label: "95" },
                  { value: "diesel", label: "Diesel" },
                ]}
              />
            </div>

            <div className="form-grid-2">
              <div>
                <Label>{t("unit_egp_l")}</Label>
                <div className="input-field flex items-center">
                  {Number(fuelPrices[selectedFuelType] || 0).toFixed(2)}
                </div>
              </div>
              <div>
                <Label>{t("total_spent")} ({t("currency")})</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={moneySpent}
                  onChange={(event) => {
                    setLastEditedField("moneySpent");
                    setMoneySpent(event.target.value);
                  }}
                  placeholder="1000.00"
                />
              </div>
            </div>

            {activeAlerts.length > 0 && (
              <div className="grid gap-3 min-[430px]:grid-cols-2">
                {activeAlerts.slice(0, 2).map((alert) => {
                  const cat = getCategoryById(alert.type);
                  const isOverdue = Number(odometer) >= alert.nextDueODO;
                  return (
                    <MaintenanceAlertCard
                      key={alert.id}
                      icon={Wrench}
                      tone={isOverdue ? "danger" : "warning"}
                      title={t(cat?.id || alert.type)}
                      subtitle={isOverdue ? t("overdue") : t("due_soon")}
                      detail={isOverdue ? "94%" : "72%"}
                      onClick={() => navigate("/maintenance")}
                    />
                  );
                })}
              </div>
            )}

            <GlassCard className="p-4">
              {!activeVehicle?.tankCapacity && (
                <div className="mb-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm font-semibold text-[var(--warning)]">
                  {t("tank_capacity_required")}
                </div>
              )}
              <FuelGaugeSlider
                value={tankLevelAfter}
                onChange={setTankLevelAfter}
                disabled={!activeVehicle?.tankCapacity}
              />
            </GlassCard>

            <div>
              <Label>{t("station")} ({t("optional")})</Label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={station}
                  onChange={(event) => setStation(event.target.value)}
                  placeholder="..."
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => setShowStationModal(true)}
                  className="icon-button"
                  aria-label={t("station")}
                >
                  <MapPin className="h-5 w-5 text-[var(--accent-primary)]" />
                </button>
              </div>
            </div>

            <div>
              <Label>{t("notes")} ({t("optional")})</Label>
              <div className="space-y-3">
                <textarea
                  className="input-field min-h-[104px] w-full"
                  rows="3"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="e.g., Long drive to Alexandria"
                />
                {notes.trim() && (
                  <button
                    type="button"
                    onClick={handleConvertToMaintenanceLog}
                    className="premium-secondary-button px-4"
                  >
                    <Wrench className="h-4 w-4" /> {t("add_maintenance")}
                  </button>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={(!liters && !moneySpent) || !odometer}
              className="premium-primary-button"
            >
              <Save className="h-7 w-7" />
              Save Fill-up
            </button>
          </GlassCard>
        </form>
      </div>

      <StationSuggestion
        show={showStationModal}
        stations={stations}
        loading={stationLoading}
        error={stationError}
        permissionState={permissionState}
        onStationSelect={handleStationSelect}
        onDetectLocation={handleDetectStation}
        onAddUserStation={handleAddUserStation}
        onClose={() => setShowStationModal(false)}
      />
      <ConfirmModal
        isOpen={convertModal.isOpen}
        onClose={() => setConvertModal({ isOpen: false })}
        onConfirm={confirmConvertToMaintenanceLog}
        title={t("add_maintenance")}
        message={t("add_maint_confirm")}
        confirmText={t("save")}
        cancelText={t("cancel")}
        variant="info"
      />
      <ConfirmModal
        isOpen={warningModal.isOpen}
        onClose={() => setWarningModal({ isOpen: false, message: "", entry: null })}
        onConfirm={() => {
          if (warningModal.entry) saveEntry(warningModal.entry);
        }}
        title={t("unusual_fillup")}
        message={warningModal.message}
        confirmText={t("save_anyway")}
        cancelText={t("cancel")}
        variant="warning"
      />
    </>
  );
}
