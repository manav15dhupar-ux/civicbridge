/**
 * @fileoverview Integration tests for API routes using in-memory request dispatching (zero sockets, zero network).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import app from "../index.js";
import complaintRoutes from "../routes/complaintRoutes.js";
import authorityRoutes from "../routes/authorityRoutes.js";
import { getAuthorities } from "../services/actionPlanService.js";
import { getExistingReports } from "../services/verificationService.js";
import { draftComplaintLetter } from "../services/geminiService.js";

/**
 * Creates an in-memory mock response object.
 * @returns {{ res: object, promise: Promise<{ statusCode: number, body: any }> }}
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

describe("API Services & Data Integrations", () => {
  it("getAuthorities should return full directory with PMC Road, Drainage, Waste, and MSEDCL", async () => {
    const list = await getAuthorities();
    assert.equal(Array.isArray(list), true);
    assert.equal(list.length >= 6, true);

    const road = list.find((a) => a.id === "pmc_road");
    assert.equal(road.name.includes("Road Department"), true);
    assert.equal(road.helpline, "1800 1030 222");
    assert.equal(road.slaHours, 72);

    const drainage = list.find((a) => a.id === "pmc_drainage");
    assert.equal(drainage.name.includes("Drainage"), true);
    assert.equal(drainage.slaHours, 24);
  });

  it("getExistingReports should load 15 seed reports in Pune", async () => {
    const reports = await getExistingReports();
    assert.equal(Array.isArray(reports), true);
    assert.equal(reports.length >= 15, true);

    const first = reports[0];
    assert.equal(Boolean(first.id), true);
    assert.equal(Boolean(first.trackingId), true);
    assert.equal(typeof first.lat, "number");
    assert.equal(typeof first.lng, "number");
    assert.equal(Boolean(first.category), true);
  });

  it("draftComplaintLetter should generate Marathi, Hindi, and English drafts", async () => {
    const sample = {
      category: "Drainage & Sewage",
      subcategory: "Drain Overflow",
      severity: 4,
      description: "Severe gutter overflow near Karve Statue.",
      location_text: "Paud Road, Kothrud, Pune",
      urgency_reason: "High public hygiene risk.",
      evidence_summary: "Wastewater spreading on road.",
      responsible_authority: "PMC - Drainage & Sewerage Maintenance Department"
    };

    // English
    const draftEn = await draftComplaintLetter({ report: sample, language: "en" });
    assert.equal(draftEn.language, "en");
    assert.equal(draftEn.letterBody.includes("Pune Municipal Corporation"), true);
    assert.equal(Boolean(draftEn.subject), true);

    // Marathi
    const draftMr = await draftComplaintLetter({ report: sample, language: "mr" });
    assert.equal(draftMr.language, "mr");
    assert.equal(draftMr.letterBody.includes("पुणे महानगरपालिका"), true);
    assert.equal(draftMr.letterBody.includes("तक्रारदार"), true);

    // Hindi
    const draftHi = await draftComplaintLetter({ report: sample, language: "hi" });
    assert.equal(draftHi.language, "hi");
    assert.equal(draftHi.letterBody.includes("पुणे नगर निगम"), true);
  });

  it("should configure Helmet with strict-origin-when-cross-origin referrerPolicy and OSM CSP", async () => {
    // Dispatch mock request to express app to verify headers
    const req = {
      method: "GET",
      url: "/health",
      headers: { host: "127.0.0.1" }
    };
    const headersSet = {};
    const res = {
      statusCode: 200,
      _headers: {},
      setHeader(k, v) {
        headersSet[k.toLowerCase()] = v;
        this._headers[k.toLowerCase()] = v;
      },
      getHeader(k) {
        return headersSet[k.toLowerCase()];
      },
      removeHeader(k) {
        delete headersSet[k.toLowerCase()];
        delete this._headers[k.toLowerCase()];
      },
      end() {},
      send() {},
      json() {}
    };

    // Run through app middleware
    await new Promise((resolve) => {
      app(req, res, () => resolve());
      resolve();
    });

    assert.equal(headersSet["referrer-policy"], "strict-origin-when-cross-origin");
    const csp = headersSet["content-security-policy"] || "";
    assert.equal(csp.includes("tile.openstreetmap.org"), true);
  });
});
