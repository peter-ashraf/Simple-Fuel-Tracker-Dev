import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  Fuel,
  Gauge,
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
import { GlassCard, MaintenanceAlertCard, SegmentedControl } from "./PremiumUI";
import { calculateTripMetrics } from "../utils/calculations";


const sanitizeIntegerInput = (value) => String(value || "").replace(/\D/g, "");

const sanitizeDecimalInput = (value, maxDecimals = 2) => {
  const raw = String(value || "")
    .replace(/,/g, "")
    .replace(/[^0-9.]/g, "");

  const [integerPart, ...decimalParts] = raw.split(".");
  const decimals = decimalParts.join("");

  if (raw.includes(".")) {
    return `${integerPart || "0"}.${decimals.slice(0, maxDecimals)}`;
  }

  return integerPart;
};

const parseNumberInput = (value) => {
  const numeric = Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
};

const blockInvalidIntegerKey = (event) => {
  if (["e", "E", "+", "-", ".", ","].includes(event.key)) {
    event.preventDefault();
  }
};

const blockInvalidDecimalKey = (event) => {
  if (["e", "E", "+", "-"].includes(event.key)) {
    event.preventDefault();
  }
};

function FieldCard({ label, icon: Icon, children, className }) {
  return (
    <div className={cn("fillup-field-card", className)}>
      <div className="fillup-field-label-row">
        {Icon && <Icon className="h-4 w-4" strokeWidth={1.9} />}
        <Label className="fillup-field-label">{label}</Label>
      </div>
      {children}
    </div>
  );
}

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

  const fuelUnitPrice = Number(fuelPrices[selectedFuelType] || 0);
  const litersValue = parseNumberInput(liters);
  const moneyValue = parseNumberInput(moneySpent);
  const costPerLiterLabel = fuelUnitPrice ? `${fuelUnitPrice.toFixed(2)} EGP/L` : "—";
  const canSave = Boolean((liters || moneySpent) && odometer);

  useEffect(() => {
    if (activeVehicleFillUps.length > 0 && !odometer) {
      setOdometer(String(activeVehicleFillUps[activeVehicleFillUps.length - 1].odometer));
    }
  }, [activeVehicleFillUps, odometer]);

  useEffect(() => {
    if (lastEditedField === "liters") {
      if (!liters) {
        setMoneySpent("");
        return;
      }

      if (fuelPrices[selectedFuelType]) {
        const nextMoney = parseNumberInput(liters) * fuelPrices[selectedFuelType];
        if (Number.isFinite(nextMoney)) {
          setMoneySpent(nextMoney.toFixed(2));
        }
      }
    } else if (lastEditedField === "moneySpent") {
      if (!moneySpent) {
        setLiters("");
        return;
      }

      if (fuelPrices[selectedFuelType]) {
        const nextLiters = parseNumberInput(moneySpent) / fuelPrices[selectedFuelType];
        if (Number.isFinite(nextLiters)) {
          setLiters(nextLiters.toFixed(2));
        }
      }
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
    const newOdometer = parseNumberInput(odometer);
    const newDate = new Date(date);
    const now = new Date();
    newDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

    return {
      date,
      timestamp: newDate.toISOString(),
      fuelType: selectedFuelType,
      liters: parseNumberInput(liters),
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
      <div className="fillup-reference-screen">
        <div className="fillup-reference-header">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="fillup-back-button"
            aria-label={t("back")}
          >
            <ChevronLeft className={cn("h-6 w-6", isRtl && "rotate-180")} strokeWidth={2.1} />
          </button>

          <div className="fillup-header-copy">
            <h1>Add Fill-up</h1>
            <p>
              <span>{activeVehicle?.name || t("select_vehicle")}</span>
              <span className="status-dot" />
              <span className="fillup-active-text">Active</span>
            </p>
          </div>
        </div>

        <form id="fillup-form" onSubmit={handleSubmit} className="fillup-reference-form">
          <GlassCard className="fillup-reference-card">
            {validationError && (
              <div className="fillup-validation-message">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}

            <FieldCard label={t("date")} icon={CalendarDays} className="fillup-field-card-full fillup-date-field">
              <DateInput
                value={date}
                onChange={setDate}
                required
                className="fillup-date-input"
              />
              <CalendarDays className="fillup-date-icon h-5 w-5" strokeWidth={1.9} />
            </FieldCard>

            <div className="fillup-input-grid">
              <FieldCard label={`${t("odometer")} (km)`} icon={Gauge}>
                <Input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  step="1"
                  value={odometer}
                  onChange={(event) => setOdometer(sanitizeIntegerInput(event.target.value))}
                  onKeyDown={blockInvalidIntegerKey}
                  placeholder="179,566"
                  required
                  min="0"
                  className="fillup-input-control"
                />
              </FieldCard>

              <FieldCard label={`${t("liters")} (L)`} icon={Fuel}>
                <Input
                  type="number"
                  inputMode="decimal"
                  pattern="[0-9]*[.]?[0-9]*"
                  step="0.01"
                  value={liters}
                  onChange={(event) => {
                    setLastEditedField("liters");
                    setLiters(sanitizeDecimalInput(event.target.value, 2));
                  }}
                  onKeyDown={blockInvalidDecimalKey}
                  placeholder="45.5"
                  className="fillup-input-control"
                />
              </FieldCard>
            </div>

            <div className="fillup-price-row">
              <FieldCard label={`${t("total_spent")} (${t("currency")})`} className="fillup-price-field">
                <Input
                  type="number"
                  inputMode="decimal"
                  pattern="[0-9]*[.]?[0-9]*"
                  step="0.01"
                  value={moneySpent}
                  onChange={(event) => {
                    setLastEditedField("moneySpent");
                    setMoneySpent(sanitizeDecimalInput(event.target.value, 2));
                  }}
                  onKeyDown={blockInvalidDecimalKey}
                  placeholder="1000.00"
                  className="fillup-input-control"
                />
              </FieldCard>
              <div className="fillup-unit-price" aria-label="Unit price">
                <span>Unit</span>
                <strong>{costPerLiterLabel}</strong>
              </div>
            </div>

            <div className="fillup-section-block fillup-fuel-type-block">
              <Label className="fillup-block-label">{t("fuel_type")}</Label>
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

            {activeAlerts.length > 0 && (
              <div className="fillup-alert-grid">
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
                      detail={alert.nextDueODO ? `${Number(alert.nextDueODO).toLocaleString()} km` : ""}
                      onClick={() => navigate("/maintenance")}
                    />
                  );
                })}
              </div>
            )}

            <GlassCard className="fillup-gauge-card">
              {!activeVehicle?.tankCapacity && (
                <div className="fillup-capacity-warning">
                  {t("tank_capacity_required")}
                </div>
              )}
              <FuelGaugeSlider
                value={tankLevelAfter}
                onChange={setTankLevelAfter}
                disabled={!activeVehicle?.tankCapacity}
              />
            </GlassCard>

            <div className="fillup-bottom-grid">
              <FieldCard label={`${t("station")} (${t("optional")})`} className="fillup-station-field">
                <div className="fillup-station-row">
                  <Input
                    type="text"
                    value={station}
                    onChange={(event) => setStation(event.target.value)}
                    placeholder="Station name"
                    className="fillup-input-control"
                  />
                  <button
                    type="button"
                    onClick={() => setShowStationModal(true)}
                    className="fillup-station-button"
                    aria-label={t("station")}
                  >
                    <MapPin className="h-4 w-4" />
                  </button>
                </div>
              </FieldCard>

              <FieldCard label={`${t("notes")} (${t("optional")})`} className="fillup-notes-field">
                <textarea
                  className="input-field fillup-notes-input"
                  rows="2"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="e.g., Long drive to Alexandria"
                />
                {notes.trim() && (
                  <button
                    type="button"
                    onClick={handleConvertToMaintenanceLog}
                    className="fillup-maintenance-note-button"
                  >
                    <Wrench className="h-4 w-4" /> {t("add_maintenance")}
                  </button>
                )}
              </FieldCard>
            </div>

          </GlassCard>
        </form>

        <button
          type="submit"
          form="fillup-form"
          disabled={!canSave}
          className="fillup-save-button"
        >
          <Save className="h-5 w-5" />
          <span>Save Fill-up</span>
          {moneyValue > 0 && litersValue > 0 && (
            <small>{litersValue.toFixed(1)} L · {moneyValue.toFixed(0)} EGP</small>
          )}
        </button>
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
