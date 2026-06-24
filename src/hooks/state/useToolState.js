import { useMemo } from 'react';
import { useLocalStorage } from '../useLocalStorage';
import { syncLocalChangesInBackground } from './syncAfterMutation';

export function useToolState(selectedVehicleId) {
  const [tripEstimates, setTripEstimates] = useLocalStorage('fueltracker-trip-estimates-v2', []);
  const [tyreComparisons, setTyreComparisons] = useLocalStorage('fueltracker-tyre-comparisons-v2', []);

  const addTripEstimate = async (estimate) => {
    setTripEstimates(prev => [...prev, { 
      ...estimate, 
      id: Date.now(), 
      vehicleId: selectedVehicleId,
      timestamp: new Date().toISOString()
    }]);
    syncLocalChangesInBackground();
  };

  const deleteTripEstimate = async (id) => {
    setTripEstimates(prev => prev.filter(e => e.id !== id));
    syncLocalChangesInBackground();
  };

  const deleteMultipleTripEstimates = async (ids) => {
    const idsSet = new Set(ids);
    setTripEstimates(prev => prev.filter(e => !idsSet.has(e.id)));
    syncLocalChangesInBackground();
  };

  const addTyreComparison = async (comparison) => {
    setTyreComparisons(prev => [...prev, {
      ...comparison,
      id: Date.now(),
      vehicleId: selectedVehicleId,
      timestamp: new Date().toISOString()
    }]);
    syncLocalChangesInBackground();
  };

  const deleteTyreComparison = async (id) => {
    setTyreComparisons(prev => prev.filter(c => c.id !== id));
    syncLocalChangesInBackground();
  };

  const deleteMultipleTyreComparisons = async (ids) => {
    const idsSet = new Set(ids);
    setTyreComparisons(prev => prev.filter(c => !idsSet.has(c.id)));
    syncLocalChangesInBackground();
  };

  const activeVehicleTripEstimates = useMemo(() => 
    tripEstimates.filter(e => e.vehicleId === selectedVehicleId)
      .sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [tripEstimates, selectedVehicleId]
  );

  const activeVehicleTyreComparisons = useMemo(() => 
    tyreComparisons.filter(c => c.vehicleId === selectedVehicleId)
      .sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [tyreComparisons, selectedVehicleId]
  );

  return {
    tripEstimates: activeVehicleTripEstimates,
    addTripEstimate,
    deleteTripEstimate,
    deleteMultipleTripEstimates,
    tyreComparisons: activeVehicleTyreComparisons,
    addTyreComparison,
    deleteTyreComparison,
    deleteMultipleTyreComparisons,
    setTripEstimates,
    setTyreComparisons
  };
}
