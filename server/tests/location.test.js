/**
 * @fileoverview Unit and Integration tests for Location Services,
 * Reverse Geocoding, Pune bounds validation, and caching.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  reverseGeocode,
  resolveNearestPuneLandmark
} from "../services/locationService.js";
import { isWithinPune, PUNE_BOUNDS } from "../utils/geo.js";
import locationRoutes from "../routes/locationRoutes.js";

/**
 * Creates mock response object for route tests.
 */
function createMockResponse() {
  let resolvePromise;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });

  const res = {
    statusCode: 200,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      resolvePromise({ statusCode: this.statusCode, body: data });
      return this;
    },
    send(data) {
      resolvePromise({ statusCode: this.statusCode, body: data });
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    }
  };

  return { res, promise };
}

describe("Location & Reverse Geocoding Services", () => {
  it("resolveNearestPuneLandmark should identify closest Pune landmark accurately", () => {
    // Coordinate near FC Road (18.5284, 73.8423)
    const result = resolveNearestPuneLandmark(18.5285, 73.8422);

    assert.ok(
      result.landmark.includes("FC Road") ||
        result.address.includes("Shivajinagar")
    );
    assert.equal(result.distanceMeters < 50, true);
    assert.equal(result.details.city, "Pune");
    assert.equal(result.details.state, "Maharashtra");
  });

  it("reverseGeocode should validate Pune bounds and return readable address with caching", async () => {
    const lat = 18.5074;
    const lng = 73.8077; // Kothrud Karve Road

    const firstCall = await reverseGeocode(lat, lng);
    assert.equal(firstCall.isWithinPune, true);
    assert.equal(firstCall.confidence, "high");
    assert.ok(firstCall.address.length > 5);

    // Second call to same coordinate should return cached: true
    const secondCall = await reverseGeocode(lat, lng);
    assert.equal(secondCall.cached, true);
    assert.equal(secondCall.address, firstCall.address);
  });

  it("isWithinPune should return false for coordinates outside Pune municipal region", () => {
    assert.equal(isWithinPune(19.076, 72.8777), false); // Mumbai
    assert.equal(isWithinPune(28.6139, 77.209), false); // New Delhi
    assert.equal(isWithinPune(12.9716, 77.5946), false); // Bengaluru
    assert.equal(isWithinPune(18.5204, 73.8567), true); // Pune PMC
  });
});

describe("Location API Endpoints", () => {
  it("GET /api/location/bounds should return official Pune bounding box", async () => {
    const { res, promise } = createMockResponse();
    const req = {
      method: "GET",
      url: "/bounds",
      headers: {},
      ip: "127.0.0.1"
    };

    locationRoutes.handle(req, res, (err) => {
      if (err) assert.fail(err.message);
    });
    const response = await promise;

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.minLat, PUNE_BOUNDS.minLat);
    assert.equal(response.body.data.maxLat, PUNE_BOUNDS.maxLat);
  });

  it("GET /api/location/reverse-geocode should reject invalid latitude or longitude", async () => {
    const { res, promise } = createMockResponse();
    const req = {
      method: "GET",
      url: "/reverse-geocode?lat=999&lng=73.8567",
      headers: {},
      ip: "127.0.0.1",
      query: { lat: "999", lng: "73.8567" }
    };

    locationRoutes.handle(req, res, (err) => {
      if (err) assert.fail(err.message);
    });
    const response = await promise;

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
    assert.ok(response.body.errors.some((e) => e.includes("Latitude")));
  });

  it("GET /api/location/reverse-geocode should return validated address and confidence badge for valid Pune coords", async () => {
    const { res, promise } = createMockResponse();
    const req = {
      method: "GET",
      url: "/reverse-geocode?lat=18.5204&lng=73.8567",
      headers: {},
      ip: "127.0.0.1",
      query: { lat: "18.5204", lng: "73.8567" }
    };

    locationRoutes.handle(req, res, (err) => {
      if (err) assert.fail(err.message);
    });
    const response = await promise;

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.isWithinPune, true);
    assert.equal(response.body.data.confidenceBadge.level, "high");
    assert.ok(response.body.data.address.includes("Pune"));
  });
});
