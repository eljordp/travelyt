import { NextResponse } from "next/server";
import { getAirport, distanceMilesBetween } from "@/lib/airports";
import { rateLimit } from "@/lib/rate-limit";

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
  error?: {
    message?: string;
    status?: string;
  };
}

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
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

export async function POST(request: Request) {
  const limited = rateLimit(request, "address:verify", 30);
  if (limited) return limited;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return bad("Address verification is not configured yet.", 503);
  }

  try {
    const body = (await request.json()) as {
      address?: string;
      airport?: string;
    };
    const address = body.address?.trim();
    const airport = body.airport ? getAirport(body.airport) : undefined;

    if (!address) return bad("Address is required.");
    if (!airport) return bad("Select a supported airport.");

    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
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
      return bad(
        data.error_message ||
          "We could not verify that address. Check the spelling or use manual mileage.",
        data.status === "ZERO_RESULTS" ? 404 : 502
      );
    }

    const result = data.results[0];
    const location = result.geometry?.location;
    if (
      typeof location?.lat !== "number" ||
      typeof location?.lng !== "number"
    ) {
      return bad("We could not read that address location.", 502);
    }

    const straightLineMiles = distanceMilesBetween(
      { latitude: airport.latitude, longitude: airport.longitude },
      { latitude: location.lat, longitude: location.lng }
    );
    const routeDistance = await getDrivingDistanceMiles({
      apiKey,
      origin: { latitude: location.lat, longitude: location.lng },
      destination: {
        latitude: airport.latitude,
        longitude: airport.longitude,
      },
    });
    const distanceMiles = routeDistance?.miles ?? straightLineMiles;

    return NextResponse.json({
      ok: true,
      address: result.formatted_address || address,
      airport: airport.code,
      airportName: airport.name,
      latitude: location.lat,
      longitude: location.lng,
      distanceMiles: Number(distanceMiles.toFixed(1)),
      distanceSource: routeDistance ? "driving_route" : "straight_line_fallback",
      distanceText: routeDistance?.distanceText,
      durationText: routeDistance?.durationText,
    });
  } catch {
    return bad("We could not verify that address.", 400);
  }
}
