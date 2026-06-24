import { createContext, useContext } from "react";
import { useVehicleState } from "./state/useVehicleState";
import { useFuelTrackingState } from "./state/useFuelTrackingState";
import { useMaintenanceState } from "./state/useMaintenanceState";
import { useToolState } from "./state/useToolState";

const FuelContext = createContext(null);

export function FuelProvider({ children }) {
  // 1. Vehicle State (Master)
  const vehicleState = useVehicleState();
  const {
    selectedVehicleId,
    setSelectedVehicleId,
    vehicles,
    activeVehicle,
  } = vehicleState;

  // 2. Fuel Tracking State
  const fuelTrackingState = useFuelTrackingState(selectedVehicleId);
  const {
    fuelPrices,
    setFuelPrices,
    setFillUps,
    activeVehicleFillUps,
    activeVehicleFillUpsByOdometer,
    addFillUp,
    deleteFillUp,
    requestDeleteFillUp,
    undoDeleteFillUp,
    deleteMultipleFillUps,
    updateFillUp,
    stats,
  } = fuelTrackingState;

  // 3. Maintenance State
  const maintenanceState = useMaintenanceState(selectedVehicleId);
  const {
    setMaintenanceLogs,
    setMaintenanceReminders,
    setMaintenanceEntries,
    categories,
    maintenanceSystems,
    setMaintenanceSystems,
    maintenanceSettings,
    getCategoryById,
    addMaintenanceLog,
    updateMaintenanceLog,
    deleteMaintenanceLog,
    addMaintenanceReminder,
    updateMaintenanceReminder,
    deleteMaintenanceReminder,
    addMaintenanceEntry,
    updateMaintenanceEntry,
    requestMaintenanceEntryDelete,
    undoMaintenanceEntryDelete,
    deleteMaintenanceEntry,
    deleteMultipleMaintenanceEntries,
    addMaintenanceCategory,
    updateMaintenanceCategory,
    deleteMaintenanceCategory,
    updateMaintenanceSettings,
    updateCategorySettings,
    activeVehicleMaintenanceLogs,
    activeVehicleMaintenanceReminders,
    activeVehicleMaintenanceEntries,
  } = maintenanceState;

  // 4. Tool State
  const toolState = useToolState(selectedVehicleId);
  const {
    tripEstimates,
    addTripEstimate,
    deleteTripEstimate,
    deleteMultipleTripEstimates,
    tyreComparisons,
    addTyreComparison,
    deleteTyreComparison,
    deleteMultipleTyreComparisons,
    setTripEstimates,
    setTyreComparisons,
  } = toolState;

  // --- Cross-Domain Logic: Cascading Delete ---
  const deleteVehicle = (id) => {
    if (vehicles.length <= 1) return;

    // Call internal delete for vehicles
    vehicleState.internalDeleteVehicle(id);

    // Cascading cleanup for other states
    setFillUps((prev) => prev.filter((f) => f.vehicleId !== id));
    setTripEstimates((prev) => prev.filter((e) => e.vehicleId !== id));
    setTyreComparisons((prev) => prev.filter((c) => c.vehicleId !== id));
    setMaintenanceLogs((prev) => prev.filter((log) => log.vehicleId !== id));
    setMaintenanceReminders((prev) =>
      prev.filter((reminder) => reminder.vehicleId !== id),
    );
    setMaintenanceEntries((prev) =>
      prev.filter((entry) => entry.vehicleId !== id),
    );
  };

  // Construct the exact same context value as before
  const contextValue = {
    // Vehicles
    vehicles,
    selectedVehicleId,
    setSelectedVehicleId,
    activeVehicle,
    addVehicle: vehicleState.addVehicle,
    editVehicle: vehicleState.editVehicle,
    deleteVehicle,

    // Fuel
    fuelPrices,
    setFuelPrices,
    activeVehicleFillUps,
    activeVehicleFillUpsByOdometer,
    addFillUp,
    deleteFillUp,
    requestDeleteFillUp,
    undoDeleteFillUp,
    deleteMultipleFillUps,
    updateFillUp,
    stats,

    // Tools
    tripEstimates,
    addTripEstimate,
    deleteTripEstimate,
    deleteMultipleTripEstimates,
    tyreComparisons,
    addTyreComparison,
    deleteTyreComparison,
    deleteMultipleTyreComparisons,

    // Maintenance
    maintenanceLogs: activeVehicleMaintenanceLogs,
    addMaintenanceLog,
    updateMaintenanceLog,
    deleteMaintenanceLog,

    maintenanceReminders: activeVehicleMaintenanceReminders,
    addMaintenanceReminder,
    updateMaintenanceReminder,
    deleteMaintenanceReminder,

    maintenanceEntries: activeVehicleMaintenanceEntries,
    addMaintenanceEntry,
    updateMaintenanceEntry,
    requestMaintenanceEntryDelete,
    undoMaintenanceEntryDelete,
    deleteMaintenanceEntry,
    deleteMultipleMaintenanceEntries,

    maintenanceSettings,
    updateMaintenanceSettings,
    updateCategorySettings,
    categories,
    addMaintenanceCategory,
    updateMaintenanceCategory,
    deleteMaintenanceCategory,
    getCategoryById,
    maintenanceSystems,
    setMaintenanceSystems,
  };

  return (
    <FuelContext.Provider value={contextValue}>{children}</FuelContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFuel() {
  const context = useContext(FuelContext);
  if (!context) throw new Error("useFuel must be used within FuelProvider");
  return context;
}
