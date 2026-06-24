import { useMemo } from 'react';
import { useLocalStorage } from '../useLocalStorage';
import { v4 as uuidv4 } from 'uuid';
import { syncLocalChangesInBackground } from './syncAfterMutation';

export function useVehicleState() {
  const [vehicles, setVehicles] = useLocalStorage('fueltracker-vehicles-v2', [{ id: 'default', name: 'My Car', type: 'car' }]);
  const [selectedVehicleId, setSelectedVehicleId] = useLocalStorage('fueltracker-active-vehicle-v2', 'default');

  const activeVehicle = useMemo(() => 
    vehicles.find(v => v.id === selectedVehicleId && !v.deletedAt) || vehicles.find(v => !v.deletedAt) || vehicles[0], 
    [vehicles, selectedVehicleId]
  );

  const addVehicle = async (vehicle) => {
    const id = `v_${Date.now()}`;
    const stableKey = uuidv4(); // Generate stable key for new vehicles
    const newVehicle = { ...vehicle, id, stableKey };
    setVehicles(prev => [...prev, newVehicle]);
    setSelectedVehicleId(id);
    syncLocalChangesInBackground();
    return newVehicle;
  };

  const editVehicle = async (id, updates) => {
    setVehicles(prev => prev.map(v => v.id === id ? { ...v, ...updates } : v));
    syncLocalChangesInBackground();
  };

  const internalDeleteVehicle = (id) => {
    if (vehicles.length <= 1) return false;
    
    // Mark vehicle as deleted (tombstone) instead of hard delete
    const deletedAt = new Date().toISOString();
    setVehicles(prev => prev.map(v => v.id === id ? { ...v, deletedAt } : v));
    
    if (selectedVehicleId === id) {
      const remaining = vehicles.find(v => v.id !== id && !v.deletedAt);
      if (remaining) {
        setSelectedVehicleId(remaining.id);
      }
    }
    return true;
  };

  const deleteVehicle = async (id) => {
    // Cascade tombstone to dependent fillups
    const fillups = JSON.parse(localStorage.getItem('fueltracker-fillups-v2') || '[]');
    const deletedAt = new Date().toISOString();
    
    // Mark all fillups for this vehicle as deleted
    const updatedFillups = fillups.map(f => f.vehicleId === id ? { ...f, deletedAt } : f);
    localStorage.setItem('fueltracker-fillups-v2', JSON.stringify(updatedFillups));
    window.dispatchEvent(new CustomEvent('local-data-changed', { detail: { entityKey: 'fillups' } }));

    // Mark vehicle as deleted
    const result = internalDeleteVehicle(id);
    if (result) {
      syncLocalChangesInBackground();
    }
    return result;
  };

  return {
    vehicles: vehicles.filter(v => !v.deletedAt),
    setVehicles,
    selectedVehicleId,
    setSelectedVehicleId,
    activeVehicle,
    addVehicle,
    editVehicle,
    internalDeleteVehicle,
    deleteVehicle
  };
}
