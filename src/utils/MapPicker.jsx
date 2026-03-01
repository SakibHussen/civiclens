import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix for default marker icon in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Component to handle map click events
function MapClickHandler({ onLocationSelect }) {
  useMapEvents({
    click: (e) => {
      onLocationSelect({
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      });
    },
  });
  return null;
}

// Reverse geocoding function using Nominatim (free, no API key needed)
async function reverseGeocode(lat, lng) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
    );
    const data = await response.json();
    if (data && data.display_name) {
      // Truncate to make it more readable
      const parts = data.display_name.split(", ");
      if (parts.length > 3) {
        return `${parts[0]}, ${parts[1]}, ${parts[2]}`;
      }
      return data.display_name;
    }
  } catch (error) {
    console.error("Geocoding error:", error);
  }
  return `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
}

export default function MapPicker({ 
  initialLocation = null, 
  onLocationChange,
  onClose 
}) {
  const [markerPosition, setMarkerPosition] = useState(initialLocation);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);

  // Default center (will be updated with user's location if available)
  const defaultCenter = initialLocation 
    ? [initialLocation.lat, initialLocation.lng]
    : [40.7128, -74.0060]; // Default to NYC

  const handleLocationSelect = async (location) => {
    setMarkerPosition(location);
    setLoading(true);
    
    // Get address from coordinates
    const addr = await reverseGeocode(location.lat, location.lng);
    setAddress(addr);
    setLoading(false);
    
    // Notify parent component
    onLocationChange({
      ...location,
      address: addr,
    });
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 shrink-0 bg-gray-900">
        <button 
          onClick={onClose} 
          className="text-white text-sm font-medium bg-white/10 rounded-xl px-3 py-1.5"
        >
          Cancel
        </button>
        <span className="text-white text-sm font-semibold">📍 Pin Location</span>
        <button 
          onClick={onClose} 
          className="text-white text-sm bg-blue-600 rounded-xl px-3 py-1.5 font-medium"
        >
          Done
        </button>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer
          center={defaultCenter}
          zoom={15}
          style={{ height: "100%", width: "100%" }}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler onLocationSelect={handleLocationSelect} />
          {markerPosition && (
            <Marker position={[markerPosition.lat, markerPosition.lng]} />
          )}
        </MapContainer>

        {/* Instructions overlay */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-black/70 text-white px-4 py-2 rounded-full text-sm">
          👆 Tap on map to pin location
        </div>

        {/* Selected location display */}
        {(markerPosition || address) && (
          <div className="absolute bottom-4 left-4 right-4 z-[1000]">
            <div className="bg-white rounded-2xl p-4 shadow-xl">
              {loading ? (
                <p className="text-sm text-gray-500 animate-pulse">Getting address...</p>
              ) : address ? (
                <p className="text-sm text-gray-800 font-medium">📍 {address}</p>
              ) : (
                <p className="text-sm text-gray-500">
                  Lat: {markerPosition?.lat.toFixed(4)}, Lng: {markerPosition?.lng.toFixed(4)}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
