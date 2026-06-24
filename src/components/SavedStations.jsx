import { useState, useEffect } from 'react';
import { MapPin, ArrowSquareOut, Pencil, Trash, CircleNotch, X } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
import { gasStationService } from '../services/gasStationService';

const MotionDiv = motion.div;

export function SavedStations({ onStationUpdate }) {
  const [stations, setStations] = useState([]);
  const [editingStation, setEditingStation] = useState(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(false);

  // Load stations on mount
  useEffect(() => {
    loadStations();
  }, []);

  const loadStations = () => {
    const userStations = gasStationService.getUserStations();
    setStations(userStations);
  };

  const openMap = (station) => {
    const { latitude, longitude } = station;
    const osmUrl = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}&zoom=18#map=18/${latitude}/${longitude}`;
    window.open(osmUrl, '_blank');
  };

  const startEdit = (station) => {
    setEditingStation(station.id);
    setEditName(station.name);
  };

  const cancelEdit = () => {
    setEditingStation(null);
    setEditName('');
  };

  const saveEdit = async () => {
    if (!editingStation || !editName.trim()) return;

    setLoading(true);
    
    try {
      // Update station in localStorage
      const userStations = gasStationService.getUserStations();
      const updatedStations = userStations.map(station => 
        station.id === editingStation 
          ? { ...station, name: editName.trim() }
          : station
      );
      
      localStorage.setItem('fueltracker-user-stations', JSON.stringify(updatedStations));
      setStations(updatedStations);
      
      if (onStationUpdate) {
        onStationUpdate();
      }
      
      cancelEdit();
    } catch (error) {
      console.error('Failed to update station:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteStation = (stationId) => {
    const userStations = gasStationService.getUserStations();
    const updatedStations = userStations.filter(station => station.id !== stationId);
    
    localStorage.setItem('fueltracker-user-stations', JSON.stringify(updatedStations));
    setStations(updatedStations);
    
    if (onStationUpdate) {
      onStationUpdate();
    }
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (stations.length === 0) {
    return (
      <div className="text-center py-8">
        <MapPin weight="duotone" className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No saved gas stations yet
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
          Add stations when you're at a gas station to build your personal database
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {stations.map((station) => (
        <MotionDiv
          key={station.id}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 10 }}
          className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800/50"
        >
          {editingStation === station.id ? (
            <div className="space-y-3">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                placeholder="Station name"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={cancelEdit}
                  className="flex-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors py-1"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  disabled={loading || !editName.trim()}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white dark:text-slate-950 font-medium py-1 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
                >
                  {loading ? (
                    <CircleNotch weight="duotone" className="w-3 h-3 animate-spin" />
                  ) : (
                    'Save'
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-1">
                  {station.name}
                </h4>
                <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                  <div className="flex items-center gap-1">
                    <MapPin weight="duotone" className="w-3 h-3" />
                    <span>
                      {station.latitude.toFixed(4)}, {station.longitude.toFixed(4)}
                    </span>
                  </div>
                  <div>Added {formatDate(station.timestamp)}</div>
                  <div className="text-emerald-600 dark:text-emerald-400 font-medium">
                    Manually added
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <button
                  onClick={() => openMap(station)}
                  className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  title="View on map"
                >
                  <ArrowSquareOut weight="duotone" className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                </button>
                <button
                  onClick={() => startEdit(station)}
                  className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  title="Edit name"
                >
                  <Pencil weight="duotone" className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                </button>
                <button
                  onClick={() => deleteStation(station.id)}
                  className="p-1.5 rounded-lg bg-red-100 dark:bg-red-500/20 hover:bg-red-200 dark:hover:bg-red-500/30 transition-colors"
                  title="Delete station"
                >
                  <Trash weight="duotone" className="w-3 h-3 text-red-500 dark:text-red-400" />
                </button>
              </div>
            </div>
          )}
        </MotionDiv>
      ))}
    </div>
  );
}
