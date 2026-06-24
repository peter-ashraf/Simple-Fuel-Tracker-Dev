import React, { useState, useMemo } from 'react';
import { 
  MagnifyingGlass, 
  X, 
  Engine, 
  Tire, 
  Drop, 
  Shield, 
  BatteryCharging, 
  Car, 
  Wrench, 
  Pulse, 
  GearSix, 
  Lightning, 
  Disc, 
  Bell, 
  GasPump, 
  Gauge, 
  Thermometer, 
  Fan, 
  Lightbulb, 
  MapPin, 
  NavigationArrow, 
  PaintBucket, 
  Toolbox, 
  Screwdriver, 
  Hammer, 
  Flask, 
  Warning, 
  Info, 
  WarningCircle, 
  CheckCircle, 
  ArrowsClockwise, 
  ShieldCheck, 
  ShieldWarning, 
  Siren, 
  Truck, 
  Motorcycle, 
  Bus, 
  Scooter, 
  Taxi,
  Plug,
  BatteryFull,
  Wind,
  Snowflake,
  Fire,
  Key,
  Lock,
  SpeakerHigh,
  Microphone,
  HardDrive,
  Cpu,
  Monitor,
  Camera,
  Bicycle
} from '@phosphor-icons/react';
import { Modal } from './Modal';
import { cn } from './index';

const ICON_LIST = [
  { name: 'Engine', component: Engine, tags: ['motor', 'piston', 'engine'] },
  { name: 'Tire', component: Tire, tags: ['wheel', 'tyre', 'tire'] },
  { name: 'Drop', component: Drop, tags: ['oil', 'fluid', 'drop', 'water'] },
  { name: 'Shield', component: Shield, tags: ['safety', 'protection', 'shield'] },
  { name: 'BatteryCharging', component: BatteryCharging, tags: ['battery', 'electrical', 'power', 'charge'] },
  { name: 'BatteryFull', component: BatteryFull, tags: ['battery', 'electrical', 'power', 'full'] },
  { name: 'Car', component: Car, tags: ['vehicle', 'car', 'body'] },
  { name: 'Wrench', component: Wrench, tags: ['tools', 'maintenance', 'repair', 'wrench'] },
  { name: 'Pulse', component: Pulse, tags: ['health', 'activity', 'pulse', 'heart'] },
  { name: 'GearSix', component: GearSix, tags: ['settings', 'config', 'gear', 'transmission'] },
  { name: 'Lightning', component: Lightning, tags: ['electric', 'power', 'zap', 'flash'] },
  { name: 'Disc', component: Disc, tags: ['brake', 'disc', 'wheel'] },
  { name: 'Bell', component: Bell, tags: ['notification', 'alert', 'reminder', 'bell'] },
  { name: 'GasPump', component: GasPump, tags: ['fuel', 'gas', 'station', 'pump'] },
  { name: 'Gauge', component: Gauge, tags: ['dashboard', 'speed', 'gauge', 'meter'] },
  { name: 'Thermometer', component: Thermometer, tags: ['heat', 'cooling', 'temp', 'thermometer'] },
  { name: 'Fan', component: Fan, tags: ['cooling', 'ac', 'fan', 'radiator'] },
  { name: 'Lightbulb', component: Lightbulb, tags: ['lights', 'electrical', 'bulb', 'idea'] },
  { name: 'MapPin', component: MapPin, tags: ['location', 'station', 'map', 'pin'] },
  { name: 'NavigationArrow', component: NavigationArrow, tags: ['gps', 'navigation', 'direction', 'arrow'] },
  { name: 'PaintBucket', component: PaintBucket, tags: ['body', 'paint', 'color', 'bucket'] },
  { name: 'Toolbox', component: Toolbox, tags: ['tools', 'repair', 'box', 'maintenance'] },
  { name: 'Screwdriver', component: Screwdriver, tags: ['tools', 'repair', 'screwdriver'] },
  { name: 'Hammer', component: Hammer, tags: ['tools', 'repair', 'hammer'] },
  { name: 'Flask', component: Flask, tags: ['chemicals', 'fluids', 'lab', 'flask'] },
  { name: 'Warning', component: Warning, tags: ['alert', 'danger', 'warning', 'triangle'] },
  { name: 'WarningCircle', component: WarningCircle, tags: ['alert', 'danger', 'warning', 'circle'] },
  { name: 'Info', component: Info, tags: ['information', 'details', 'info'] },
  { name: 'CheckCircle', component: CheckCircle, tags: ['done', 'complete', 'check', 'circle'] },
  { name: 'ArrowsClockwise', component: ArrowsClockwise, tags: ['refresh', 'cycle', 'sync', 'arrows'] },
  { name: 'ShieldCheck', component: ShieldCheck, tags: ['safety', 'verified', 'shield', 'check'] },
  { name: 'ShieldWarning', component: ShieldWarning, tags: ['safety', 'alert', 'shield', 'warning'] },
  { name: 'Siren', component: Siren, tags: ['emergency', 'alert', 'siren', 'alarm'] },
  { name: 'Truck', component: Truck, tags: ['vehicle', 'truck', 'heavy'] },
  { name: 'Motorcycle', component: Motorcycle, tags: ['vehicle', 'bike', 'motorcycle'] },
  { name: 'Bus', component: Bus, tags: ['vehicle', 'bus', 'public'] },
  { name: 'Scooter', component: Scooter, tags: ['vehicle', 'scooter', 'bike'] },
  { name: 'Taxi', component: Taxi, tags: ['vehicle', 'taxi', 'cab'] },
  { name: 'Bicycle', component: Bicycle, tags: ['vehicle', 'bike', 'bicycle'] },
  { name: 'Plug', component: Plug, tags: ['electric', 'charge', 'plug', 'ev'] },
  { name: 'Wind', component: Wind, tags: ['air', 'ac', 'ventilation', 'wind'] },
  { name: 'Snowflake', component: Snowflake, tags: ['cold', 'ac', 'cooling', 'winter'] },
  { name: 'Fire', component: Fire, tags: ['heat', 'combustion', 'fire', 'engine'] },
  { name: 'Key', component: Key, tags: ['security', 'access', 'key', 'ignition'] },
  { name: 'Lock', component: Lock, tags: ['security', 'access', 'lock'] },
  { name: 'SpeakerHigh', component: SpeakerHigh, tags: ['audio', 'sound', 'speaker'] },
  { name: 'Microphone', component: Microphone, tags: ['audio', 'voice', 'mic'] },
  { name: 'HardDrive', component: HardDrive, tags: ['data', 'storage', 'computer'] },
  { name: 'Cpu', component: Cpu, tags: ['electronics', 'computer', 'chip', 'cpu'] },
  { name: 'Monitor', component: Monitor, tags: ['screen', 'display', 'monitor'] },
  { name: 'Camera', component: Camera, tags: ['parking', 'safety', 'camera'] }
];

// eslint-disable-next-line react-refresh/only-export-components
export const ICON_MAP_DATA = {
  Engine, Tire, Drop, Shield, BatteryCharging, BatteryFull, Car, Wrench, Pulse, GearSix,
  Lightning, Disc, Bell, GasPump, Gauge, Thermometer, Fan, Lightbulb, MapPin,
  NavigationArrow, PaintBucket, Toolbox, Screwdriver, Hammer, Flask, Warning, WarningCircle,
  Info, CheckCircle, ArrowsClockwise, ShieldCheck, ShieldWarning, Siren, Truck, Motorcycle,
  Bus, Scooter, Taxi, Bicycle, Plug, Wind, Snowflake, Fire, Key, Lock,
  SpeakerHigh, Microphone, HardDrive, Cpu, Monitor, Camera
};

export const IconPicker = ({ isOpen, onClose, onSelect, currentIcon }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredIcons = useMemo(() => {
    if (!searchTerm.trim()) return ICON_LIST;
    const term = searchTerm.toLowerCase();
    return ICON_LIST.filter(icon => 
      icon.name.toLowerCase().includes(term) || 
      icon.tags.some(tag => tag.toLowerCase().includes(term))
    );
  }, [searchTerm]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Select Icon">
      <div className="space-y-4">
        <div className="relative">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            autoFocus
            type="text"
            placeholder="Search icons (e.g. engine, tool, car)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-3 bg-slate-100 dark:bg-slate-900 border-none rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X weight="bold" className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 max-h-[350px] overflow-y-auto p-1 custom-scrollbar">
          {filteredIcons.length > 0 ? (
            filteredIcons.map((icon) => {
              const IconComponent = icon.component;
              const isSelected = currentIcon === icon.name;
              return (
                <button
                  key={icon.name}
                  onClick={() => {
                    onSelect(icon.name);
                    onClose();
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center p-3 rounded-xl transition-all aspect-square gap-1",
                    isSelected 
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25" 
                      : "bg-slate-50 dark:bg-white/[0.03] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.08]"
                  )}
                  title={icon.name}
                >
                  <IconComponent weight="duotone" className="w-6 h-6" />
                </button>
              );
            })
          ) : (
            <div className="col-span-full py-12 text-center text-slate-500">
              <p className="text-sm">No icons found for "{searchTerm}"</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
