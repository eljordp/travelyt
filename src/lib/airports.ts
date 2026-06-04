export interface Airport {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
}

export const AIRPORTS: Airport[] = [
  { code: "ATL", name: "Atlanta Hartsfield-Jackson", latitude: 33.6407, longitude: -84.4277 },
  { code: "BOS", name: "Boston Logan", latitude: 42.3656, longitude: -71.0096 },
  { code: "BWI", name: "Baltimore/Washington", latitude: 39.1774, longitude: -76.6684 },
  { code: "DCA", name: "Washington Reagan National", latitude: 38.8512, longitude: -77.0402 },
  { code: "DEN", name: "Denver International", latitude: 39.8561, longitude: -104.6737 },
  { code: "DFW", name: "Dallas/Fort Worth", latitude: 32.8998, longitude: -97.0403 },
  { code: "DTW", name: "Detroit Metropolitan", latitude: 42.2162, longitude: -83.3554 },
  { code: "EWR", name: "New York Newark", latitude: 40.6895, longitude: -74.1745 },
  { code: "HOU", name: "Houston Hobby", latitude: 29.6454, longitude: -95.2789 },
  { code: "IAD", name: "Washington Dulles", latitude: 38.9531, longitude: -77.4565 },
  { code: "IAH", name: "Houston Intercontinental", latitude: 29.9902, longitude: -95.3368 },
  { code: "JFK", name: "New York JFK", latitude: 40.6413, longitude: -73.7781 },
  { code: "LAS", name: "Las Vegas Harry Reid", latitude: 36.084, longitude: -115.1537 },
  { code: "LAX", name: "Los Angeles International", latitude: 33.9416, longitude: -118.4085 },
  { code: "MCO", name: "Orlando International", latitude: 28.4312, longitude: -81.3081 },
  { code: "MDW", name: "Chicago Midway", latitude: 41.7868, longitude: -87.7522 },
  { code: "MIA", name: "Miami International", latitude: 25.7959, longitude: -80.287 },
  { code: "MSP", name: "Minneapolis-Saint Paul", latitude: 44.8848, longitude: -93.2223 },
  { code: "ORD", name: "Chicago O'Hare", latitude: 41.9742, longitude: -87.9073 },
  { code: "ORF", name: "Norfolk International", latitude: 36.8946, longitude: -76.2012 },
  { code: "PDX", name: "Portland International", latitude: 45.5898, longitude: -122.5951 },
  { code: "PHX", name: "Phoenix Sky Harbor", latitude: 33.4342, longitude: -112.0116 },
  { code: "RIC", name: "Richmond International", latitude: 37.5052, longitude: -77.3197 },
  { code: "SEA", name: "Seattle-Tacoma", latitude: 47.4502, longitude: -122.3088 },
  { code: "SFO", name: "San Francisco International", latitude: 37.6213, longitude: -122.379 },
];

export function getAirport(code: string) {
  return AIRPORTS.find((airport) => airport.code === code.toUpperCase());
}

export function distanceMilesBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
) {
  const radiusMiles = 3958.8;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radiusMiles * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
