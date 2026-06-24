// Gas Station Service - COMPLETE OVERPASS API IMPLEMENTATION
// Replaces Nominatim with reliable OSM POI queries

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_URL_BACKUP = 'https://z.overpass-api.de/api/interpreter';
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const SEARCH_RADIUS_METERS = 2500;

class GasStationService {
  constructor() {
    this.cache = new Map();
    this.lastRequestTime = 0;
    this.userStationsKey = 'fueltracker-user-stations';
  }

  saveUserStation(stationName, latitude, longitude) {
    const userStations = this.getUserStations();
    const newStation = {
      id: `user_${Date.now()}`,
      name: stationName.trim(),
      latitude,
      longitude,
      timestamp: Date.now(),
      address: { road: null, suburb: null, city: 'User Location', country: 'Egypt' }
    };
    
    userStations.push(newStation);
    localStorage.setItem(this.userStationsKey, JSON.stringify(userStations));
    return newStation;
  }

  getUserStations() {
    try {
      const stored = localStorage.getItem(this.userStationsKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  findNearbyUserStations(latitude, longitude, maxDistance = SEARCH_RADIUS_METERS) {
    const userStations = this.getUserStations();
    return userStations
      .map(station => ({
        ...station,
        distance: Math.round(this.calculateDistance(latitude, longitude, station.latitude, station.longitude))
      }))
      .filter(station => station.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance);
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  getCacheKey(latitude, longitude) {
    const lat = Math.round(latitude * 10000) / 10000;
    const lon = Math.round(longitude * 10000) / 10000;
    return `${lat},${lon}`;
  }

  async waitForRateLimit() {
    const now = Date.now();
    if (now - this.lastRequestTime < 2000) {
      await new Promise(resolve => setTimeout(resolve, 2000 - (now - this.lastRequestTime)));
    }
    this.lastRequestTime = Date.now();
  }

  getCachedResult(latitude, longitude) {
    const key = this.getCacheKey(latitude, longitude);
    const cached = this.cache.get(key);
    return cached && (Date.now() - cached.timestamp) < CACHE_DURATION ? cached.data : null;
  }

  cacheResult(latitude, longitude, data) {
    const key = this.getCacheKey(latitude, longitude);
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  // 🔥 MAIN METHOD - OVERPASS API FOR FUEL STATIONS
  async findNearbyGasStations(latitude, longitude) {
    console.log('🔍 Overpass API: Searching fuel stations near:', { latitude, longitude });
    
    try {
      // Check cache first
      const cached = this.getCachedResult(latitude, longitude);
      if (cached?.length > 0) {
        console.log('📦 Cache hit:', cached.length, 'stations');
        return cached;
      }

      await this.waitForRateLimit();

      // PERFECT OVERPASS QUERY for amenity=fuel within 5km radius
      const overpassQuery = `[out:json][timeout:30];
      (
        // Nodes with fuel amenity
        node["amenity"="fuel"](around:${SEARCH_RADIUS_METERS},${latitude},${longitude});
        
        // Ways with fuel amenity  
        way["amenity"="fuel"](around:${SEARCH_RADIUS_METERS},${latitude},${longitude});
        
        // Relations with fuel amenity
        relation["amenity"="fuel"](around:${SEARCH_RADIUS_METERS},${latitude},${longitude});
        
        // Brand-specific stations (backup)
        node["brand"~"total|shell|bp|coastal|wataniya|taqa"]["amenity"~"fuel|gas_station"](around:${SEARCH_RADIUS_METERS},${latitude},${longitude});
        way["brand"~"total|shell|bp|coastal|wataniya|taqa"]["amenity"~"fuel|gas_station"](around:${SEARCH_RADIUS_METERS},${latitude},${longitude});
      );
      out body;
      >;
      out skel qt;`;

      console.log('📡 Overpass query sent...');

      // Try primary + backup endpoints
      const endpoints = [OVERPASS_URL, OVERPASS_URL_BACKUP];
      
      for (let i = 0; i < endpoints.length; i++) {
        try {
          const response = await fetch(endpoints[i], {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'FuelTracker-Egypt/2.0'
            },
            body: `data=${encodeURIComponent(overpassQuery)}`
          });

          if (response.ok) {
            const data = await response.json();
            console.log(`✅ Overpass ${i+1}: ${data.elements?.length || 0} stations found!`);
            
            if (data.elements?.length > 0) {
              const stations = this.processOverpassElements(data.elements, latitude, longitude);
              this.cacheResult(latitude, longitude, stations);
              console.log('⛽ Final stations:', stations.slice(0, 3).map(s => ({name: s.name, dist: s.distance})));
              return stations;
            }
          }
        } catch (endpointError) {
          console.log(`❌ Endpoint ${i+1} failed:`, endpointError.message);
        }
        
        // Wait between endpoints
        if (i < endpoints.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }

      // FALLBACK: User stations only
      console.log('🔄 No Overpass results, returning user stations');
      return this.findNearbyUserStations(latitude, longitude);

    } catch (error) {
      console.error('❌ Gas station search failed:', error);
      return this.findNearbyUserStations(latitude, longitude);
    }
  }

  // Process raw Overpass elements into clean station objects
  processOverpassElements(elements, userLat, userLon) {
    const stations = elements
      .map(element => {
        // Extract coordinates
        let lat, lon;
        if (element.type === 'node') {
          lat = element.lat;
          lon = element.lon;
        } else if (element.type === 'way') {
          // Use center of bounding box for ways
          if (element.bounds) {
            lat = (parseFloat(element.bounds.minlat) + parseFloat(element.bounds.maxlat)) / 2;
            lon = (parseFloat(element.bounds.minlon) + parseFloat(element.bounds.maxlon)) / 2;
          }
        } else {
          // Relations - use first node or center
          lat = element.centre?.lat || element.members?.[0]?.lat;
          lon = element.centre?.lon || element.members?.[0]?.lon;
        }

        if (!lat || !lon) return null;

        // Extract station info from tags
        const tags = element.tags || {};
        const name = tags.name || tags['name:ar'] || tags['name:en'] || tags.brand || 'Fuel Station';
        const brand = tags.brand || tags.operator || '';
        const address = {
          road: tags['addr:street'] || tags.highway,
          suburb: tags.suburb || tags.neighbourhood,
          city: tags.city || tags.town || tags.village,
          country: tags.country || 'Egypt'
        };

        const distance = this.calculateDistance(userLat, userLon, lat, lon);

        return {
          id: element.id.toString(),
          name: this.cleanStationName(name),
          brand: this.extractBrand(brand),
          distance: Math.round(distance),
          latitude: lat,
          longitude: lon,
          address,
          osmData: element,
          tags
        };
      })
      .filter(Boolean) // Remove nulls
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 12); // Top 12 closest

    return stations;
  }

  cleanStationName(name) {
    // Remove common prefixes/suffixes
    const prefixes = ['محطة', 'station', 'gas station', 'fuel station', 'petrol station'];
    let cleanName = name.trim();
    
    prefixes.forEach(prefix => {
      cleanName = cleanName.replace(new RegExp(`^${prefix}\\s*`, 'i'), '').trim();
      cleanName = cleanName.replace(new RegExp(`\\s*${prefix}$`, 'i'), '').trim();
    });

    return cleanName || 'Fuel Station';
  }

  extractBrand(brandString) {
    const knownBrands = [
      'total', 'توتوال', 'totalenergies', 'shell', 'شل', 'bp', 'بي بي', 
      'mobil', 'موبيل', 'esso', 'إيسو', 'coastal', 'كوستال', 'wataniya', 'وطنية'
    ];
    
    return knownBrands.find(brand => brandString.toLowerCase().includes(brand)) || '';
  }

  clearCache() {
    this.cache.clear();
  }

  getCacheSize() {
    return this.cache.size;
  }
}

export const gasStationService = new GasStationService();
