import { distanceMilesBetween, getAirport } from "@/lib/airports";

interface GoogleGeocodeResult {
  formatted_address?: string;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
}

interface GoogleRoutesResponse {
  routes?: {
    distanceMeters?: number;
    duration?: string;
  }[];
}

export type VerifiedRouteDistance = {
  ok: true;
  address: string;
  airport: string;
  airportName: string;
  latitude: number;
  longitude: number;
  distanceMiles: number;
  distanceSource: "driving_route" | "straight_line_fallback";
  distanceText?: string;
  durationText?: string;
  verifiedAt: string;
};

export type RouteDistanceFailure = {
  ok: false;
  error: string;
  status: number;
};

function formatGoogleDuration(duration?: string) {
  const seconds = Number(duration?.replace("s", ""));
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes
    ? `${hours} hr ${remainingMinutes} min`
    : `${hours} hr`;
}

async function getDrivingDistanceMiles({
  apiKey,
  origin,
  destination,
}: {
  apiKey: string;
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
}) {
  try {
    const response = await fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
        },
        body: JSON.stringify({
          origin: {
            location: {
              latLng: {
                latitude: origin.latitude,
                longitude: origin.longitude,
              },
            },
          },
          destination: {
            location: {
              latLng: {
                latitude: destination.latitude,
                longitude: destination.longitude,
              },
            },
          },
          routingPreference: "TRAFFIC_UNAWARE",
          travelMode: "DRIVE",
          units: "IMPERIAL",
        }),
        next: { revalidate: 60 * 60 * 24 },
      }
    );
    const data = (await response.json()) as GoogleRoutesResponse;
    const route = data.routes?.[0];

    if (!response.ok || typeof route?.distanceMeters !== "number") {
      return undefined;
    }

    return {
      miles: route.distanceMeters / 1609.344,
      distanceText: `${(route.distanceMeters / 1609.344).toFixed(1)} mi`,
      durationText: formatGoogleDuration(route.duration),
    };
  } catch {
    return undefined;
  }
}

export async function resolveServerRouteDistance({
  apiKey,
  address,
  airportCode,
  requireDrivingRoute = false,
}: {
  apiKey: string;
  address: string;
  airportCode: string;
  requireDrivingRoute?: boolean;
}): Promise<VerifiedRouteDistance | RouteDistanceFailure> {
  const cleanAddress = address.trim();
  const airport = getAirport(airportCode);
  if (!cleanAddress) {
    return { ok: false, error: "Address is required.", status: 400 };
  }
  if (!airport) {
    return { ok: false, error: "Select a supported airport.", status: 400 };
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", cleanAddress);
    url.searchParams.set("region", "us");
    url.searchParams.set("key", apiKey);

    const response = await fetch(url, {
      next: { revalidate: 60 * 60 * 24 },
    });
    const data = (await response.json()) as {
      status?: string;
      error_message?: string;
      results?: GoogleGeocodeResult[];
    };

    if (!response.ok || data.status !== "OK" || !data.results?.length) {
      return {
        ok: false,
        error:
          data.error_message ||
          "We could not verify that address. Check the spelling and try again.",
        status: data.status === "ZERO_RESULTS" ? 404 : 502,
      };
    }

    const result = data.results[0];
    const location = result.geometry?.location;
    if (
      typeof location?.lat !== "number" ||
      typeof location?.lng !== "number"
    ) {
      return {
        ok: false,
        error: "We could not read that address location.",
        status: 502,
      };
    }

    const routeDistance = await getDrivingDistanceMiles({
      apiKey,
      origin: { latitude: location.lat, longitude: location.lng },
      destination: {
        latitude: airport.latitude,
        longitude: airport.longitude,
      },
    });
    if (!routeDistance && requireDrivingRoute) {
      return {
        ok: false,
        error:
          "Verified driving-route pricing is temporarily unavailable. No booking or charge was created.",
        status: 503,
      };
    }

    const straightLineMiles = distanceMilesBetween(
      { latitude: airport.latitude, longitude: airport.longitude },
      { latitude: location.lat, longitude: location.lng }
    );
    const distanceMiles = routeDistance?.miles ?? straightLineMiles;

    return {
      ok: true,
      address: result.formatted_address || cleanAddress,
      airport: airport.code,
      airportName: airport.name,
      latitude: location.lat,
      longitude: location.lng,
      distanceMiles: Number(distanceMiles.toFixed(1)),
      distanceSource: routeDistance
        ? "driving_route"
        : "straight_line_fallback",
      distanceText: routeDistance?.distanceText,
      durationText: routeDistance?.durationText,
      verifiedAt: new Date().toISOString(),
    };
  } catch {
    return {
      ok: false,
      error: "We could not verify that address.",
      status: 502,
    };
  }
}
