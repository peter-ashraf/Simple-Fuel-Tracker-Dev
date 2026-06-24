import { useState, useEffect, useCallback } from 'react';

export function useLocationDetection() {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [permissionState, setPermissionState] = useState('prompt');

  // Check initial permission state
  useEffect(() => {
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        setPermissionState(result.state);
        result.addEventListener('change', () => {
          setPermissionState(result.state);
        });
      });
    }
  }, []);

  const getCurrentLocation = useCallback(async () => {
    console.log('📍 Starting location detection...');
    
    if (!navigator.geolocation) {
      const error = 'Geolocation is not supported by your browser';
      console.error('❌', error);
      setError(error);
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('🔍 Requesting GPS location...');
      const position = await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Location request timed out after 10 seconds'));
        }, 10000);

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            clearTimeout(timeoutId);
            console.log('✅ Location received:', pos);
            resolve(pos);
          },
          (err) => {
            clearTimeout(timeoutId);
            console.error('❌ Geolocation error:', err);
            reject(err);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000 // 5 minutes cache
          }
        );
      });

      const locationData = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp
      };

      console.log('🎯 Location data processed:', locationData);
      setLocation(locationData);
      setPermissionState('granted');
      return locationData;
    } catch (err) {
      console.error('❌ Location detection failed:', err);
      
      let errorMessage = 'Unable to retrieve your location';
      
      switch (err.code) {
        case err.PERMISSION_DENIED:
          errorMessage = 'Location permission denied. Please enable location access in your browser settings.';
          setPermissionState('denied');
          break;
        case err.POSITION_UNAVAILABLE:
          errorMessage = 'Location information is unavailable. Please check your GPS/location services.';
          break;
        case err.TIMEOUT:
          errorMessage = 'Location request timed out. Please try again.';
          break;
        default:
          errorMessage = `Location error: ${err.message || 'Unknown error occurred'}`;
          break;
      }
      
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
      console.log('🏁 Location detection completed');
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000
          }
        );
      });

      const locationData = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp
      };

      setLocation(locationData);
      setPermissionState('granted');
      return true;
    } catch (err) {
      if (err.code === err.PERMISSION_DENIED) {
        setPermissionState('denied');
        setError('Location permission was denied. Please enable location access in your browser settings.');
      } else {
        setError('Failed to get location permission.');
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearLocation = useCallback(() => {
    setLocation(null);
    setError(null);
  }, []);

  return {
    location,
    loading,
    error,
    permissionState,
    getCurrentLocation,
    requestPermission,
    clearLocation,
    isSupported: !!navigator.geolocation
  };
}
