import { useState, useEffect, useRef } from 'react';
import { MapPin, NavigationArrow, CircleNotch, WarningCircle, X, ArrowSquareOut, ArrowsClockwise, CaretDown } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../components/ui';
import { gasStationService } from '../services/gasStationService';

const MotionDiv = motion.div;

export function StationSuggestion({
  stations = [],
  loading = false,
  error = null,
  onStationSelect,
  onDetectLocation,
  onAddUserStation,
  onClose,
  show = false,
}) {
  const [selectedStation, setSelectedStation] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [stationNameInput, setStationNameInput] = useState('');
  const [showAddStation, setShowAddStation] = useState(false);
  const [showSavedStations, setShowSavedStations] = useState(false);
  const [savedStations, setSavedStations] = useState([]);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (showAddStation) {
      inputRef.current.focus();
    }
  }, [showAddStation]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowSavedStations(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleStationSelect = (station) => {
    setSelectedStation(station.id);
    onStationSelect(station);
    setTimeout(() => onClose(), 500); // Close after selection animation
  };

  const handleDetectLocation = async () => {
    setIsDetecting(true);
    await onDetectLocation();
    setTimeout(() => setIsDetecting(false), 500); // Show animation briefly
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onDetectLocation();
    setTimeout(() => setIsRefreshing(false), 1000); // Show refresh animation
  };

  const handleAddStation = () => {
    if (stationNameInput.trim()) {
      onAddUserStation(stationNameInput.trim());
      setStationNameInput('');
      setShowAddStation(false);
    }
  };

  const handleShowSavedStations = () => {
    const userStations = gasStationService.getUserStations();
    setSavedStations(userStations);
    setShowSavedStations(true);
  };

  const handleSelectSavedStation = (station) => {
    onStationSelect(station);
    setShowSavedStations(false);
  };

  const openMap = (station) => {
    // Open the station location in OpenStreetMap
    const { latitude, longitude, name } = station;
    const osmUrl = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}&zoom=18#map=18/${latitude}/${longitude}`;
    console.log('🗺️ Opening map for station:', name, osmUrl);
    window.open(osmUrl, '_blank');
  };

  if (!show) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <MotionDiv
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        
        {/* Modal Content */}
        <MotionDiv
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ 
            type: 'spring', 
            stiffness: 300, 
            damping: 25,
            duration: 0.2 
          }}
          className="relative w-full max-w-md glass-card rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[80vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Select Gas Station
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={loading || isRefreshing}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Refresh station search"
              >
                <ArrowsClockwise weight="duotone" className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X weight="duotone" className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {/* No Stations Found */}
            {!loading && !error && stations.length === 0 && !showAddStation && (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
                  <MapPin weight="duotone" className="w-6 h-6 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white mb-2">
                    No saved gas stations yet
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    You haven't saved any gas stations yet. Add stations when you're at a gas station to build your personal database.
                  </p>
                  <div className="space-y-2">
                    <button
                      onClick={() => setShowAddStation(true)}
                      className="w-full bg-emerald-500 hover:bg-emerald-400 text-white dark:text-slate-950 font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                      <MapPin weight="duotone" className="w-4 h-4" />
                      Add Current Location
                    </button>
                    <button
                      onClick={handleDetectLocation}
                      className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50"
                      disabled={isDetecting}
                    >
                      Try detecting again
                    </button>
                    <div className="relative" ref={dropdownRef}>
                      <button
                        onClick={handleShowSavedStations}
                        className="w-full text-xs text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50 bg-transparent border-none cursor-pointer py-1"
                        disabled={isDetecting}
                      >
                        {savedStations.length === 0 ? 'No saved stations yet' : `Or select from saved stations (${savedStations.length})`}
                      </button>
                      
                      {/* Saved Stations Dropdown */}
                      <AnimatePresence>
                        {showSavedStations && (
                          <div className="absolute bottom-full left-0 right-0 mb-2 z-50 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg">
                            {savedStations.length > 0 ? (
                              <div className="p-1 max-h-48 overflow-y-auto">
                                {savedStations.map((station) => (
                                  <button
                                    key={station.id}
                                    onClick={() => handleSelectSavedStation(station)}
                                    className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex items-center justify-between"
                                  >
                                    <span className="text-sm text-slate-900 dark:text-white">
                                      {station.name}
                                    </span>
                                    <span className="text-xs text-slate-500 dark:text-slate-400">
                                      {station.distance ? `${station.distance}m` : 'Saved'}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="p-4 text-center">
                                <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center mx-auto mb-3">
                                  <MapPin className="w-4 h-4 text-amber-500" />
                                </div>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                  No saved stations yet
                                </p>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                  Add stations when you're at a gas station
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Add Station Form */}
            {showAddStation && (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                  <MapPin className="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white mb-2">
                    What gas station are you at?
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    We'll save this location for future reference.
                  </p>
                  <div className="space-y-3">
                    <input
                      ref={inputRef}
                      type="text"
                      value={stationNameInput}
                      onChange={(e) => setStationNameInput(e.target.value)}
                      placeholder="e.g. Total, Mobil, Shell..."
                      className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowAddStation(false)}
                        className="flex-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors py-2"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAddStation}
                        disabled={!stationNameInput.trim()}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white dark:text-slate-950 font-medium py-2 px-4 rounded-xl transition-colors"
                      >
                        Save Station
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                  <CircleNotch weight="duotone" className="w-6 h-6 text-emerald-500 animate-spin" />
                </div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  Finding nearby stations...
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  This may take a few seconds
                </p>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                  <WarningCircle weight="duotone" className="w-6 h-6 text-red-500" />
                </div>
                <p className="text-sm font-medium text-slate-900 dark:text-white mb-2">
                  Location Error
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  {error}
                </p>
                <button
                  onClick={handleDetectLocation}
                  className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  Try Again
                </button>
              </div>
            )}

            {/* Stations List */}
            {stations.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">
                  Found {stations.length} nearby station{stations.length !== 1 ? 's' : ''}
                </p>
                {stations.map((station) => (
                  <MotionDiv
                    key={station.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                      "w-full p-3 rounded-xl border transition-all",
                      "hover:bg-slate-50 dark:hover:bg-slate-800/50",
                      "hover:border-emerald-500/50",
                      selectedStation === station.id && "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500/50",
                      "border-slate-200 dark:border-slate-700/50"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => handleStationSelect(station)}
                          className="w-full text-left"
                        >
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                            {station.name}
                          </p>
                          {station.address.road && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-1">
                              {station.address.road}
                              {station.address.suburb && `, ${station.address.suburb}`}
                            </p>
                          )}
                        </button>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                          <MapPin weight="duotone" className="w-3 h-3" />
                          <span className="font-medium">{station.distance}m</span>
                        </div>
                        {station.latitude && station.longitude && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openMap(station);
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            title={`View ${station.name} on map`}
                          >
                            <ArrowSquareOut weight="duotone" className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                          </button>
                        )}
                      </div>
                    </div>
                  </MotionDiv>
                ))}
              </div>
            )}

            {/* Manual Input Option */}
            {(stations.length > 0 || error) && (
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700/50">
                <button
                  onClick={() => {
                    onStationSelect({ name: '' });
                    onClose();
                  }}
                  className="w-full text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                >
                  Or enter station name manually
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          {stations.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700/50 flex items-center justify-between">
              <button
                onClick={onClose}
                className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRefresh}
                disabled={loading || isRefreshing}
                className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowsClockwise weight="duotone" className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          )}
        </MotionDiv>
      </div>
    </AnimatePresence>
  );
}
