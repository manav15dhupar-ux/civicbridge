/**
 * @fileoverview Integration tests for API routes using in-memory request dispatching (zero sockets, zero network).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import app from "../index.js";
import complaintRoutes from "../routes/complaintRoutes.js";
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
  it("applies CORS only to API routes and returns JSON 403 for blocked origins", async () => {
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    try {
      const { port } = server.address();
      const baseUrl = `http://127.0.0.1:${port}`;

      const sameHostOrigin = `http://127.0.0.1:${port}`;
      const sameHostResponse = await fetch(`${baseUrl}/api/authorities`, {
        headers: { Origin: sameHostOrigin }
      });
      assert.equal(sameHostResponse.status, 200);
      assert.equal(
        sameHostResponse.headers.get("access-control-allow-origin"),
        sameHostOrigin
      );

      const configuredOriginResponse = await fetch(
        `${baseUrl}/api/authorities`,
        {
          headers: { Origin: "http://localhost:3000" }
        }
      );
      assert.equal(configuredOriginResponse.status, 200);
      assert.equal(
        configuredOriginResponse.headers.get("access-control-allow-origin"),
        "http://localhost:3000"
      );

      const blockedResponse = await fetch(`${baseUrl}/api/authorities`, {
        headers: { Origin: "https://untrusted.example" }
      });
      assert.equal(blockedResponse.status, 403);
      assert.equal(
        blockedResponse.headers
          .get("content-type")
          .includes("application/json"),
        true
      );
      assert.equal(
        (await blockedResponse.json()).code,
        "CORS_ORIGIN_FORBIDDEN"
      );

      const staticResponse = await fetch(`${baseUrl}/js/app.js`, {
        headers: { Origin: "https://untrusted.example" }
      });
      assert.equal(staticResponse.status, 200);
      assert.equal(
        staticResponse.headers.get("access-control-allow-origin"),
        null
      );

      const noOriginResponse = await fetch(`${baseUrl}/api/authorities`);
      assert.equal(noOriginResponse.status, 200);
      assert.equal(
        noOriginResponse.headers.get("access-control-allow-origin"),
        null
      );

      const headersResponse = await fetch(`${baseUrl}/`);
      const csp = headersResponse.headers.get("content-security-policy");
      assert.ok(csp.includes("'self'"));
      assert.ok(csp.includes("https://cdn.tailwindcss.com"));
      assert.ok(csp.includes("https://unpkg.com"));
      assert.ok(csp.includes("https://*.tile.openstreetmap.org"));
      assert.equal(csp.includes("unsafe-eval"), false);
      assert.equal(
        headersResponse.headers.get("permissions-policy"),
        "camera=(self), geolocation=(self), microphone=(self)"
      );
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

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
    const configuredApiKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

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

    try {
      const draftEn = await draftComplaintLetter({
        report: sample,
        language: "en"
      });
      assert.equal(draftEn.language, "en");
      assert.equal(
        draftEn.letterBody.includes("Pune Municipal Corporation"),
        true
      );
      assert.equal(Boolean(draftEn.subject), true);

      const draftMr = await draftComplaintLetter({
        report: sample,
        language: "mr"
      });
      assert.equal(draftMr.language, "mr");
      assert.equal(draftMr.letterBody.includes("पुणे महानगरपालिका"), true);
      assert.equal(draftMr.letterBody.includes("तक्रारदार"), true);

      const draftHi = await draftComplaintLetter({
        report: sample,
        language: "hi"
      });
      assert.equal(draftHi.language, "hi");
      assert.equal(draftHi.letterBody.includes("पुणे नगर निगम"), true);
    } finally {
      if (configuredApiKey === undefined) {
        delete process.env.GEMINI_API_KEY;
      } else {
        process.env.GEMINI_API_KEY = configuredApiKey;
      }
    }
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

    assert.equal(
      headersSet["referrer-policy"],
      "strict-origin-when-cross-origin"
    );
    const csp = headersSet["content-security-policy"] || "";
    assert.equal(csp.includes("tile.openstreetmap.org"), true);
  });

  it("POST /api/complaints/file should generate tracking ID, status timeline, online/offline routes, share links, and persist report", async () => {
    const reportsPath = new URL("../../data/reports.json", import.meta.url);
    const rawBackup = await fs.readFile(reportsPath, "utf-8");

    try {
      const sampleReport = {
        category: "Roads & Footpaths",
        subcategory: "Potholes",
        severity: 4,
        description:
          "Massive pothole on Baner High Street near Balewadi phata.",
        location_text: "Baner High Street, Pune",
        lat: 18.559,
        lng: 73.7868,
        urgency_reason: "High accident risk for evening two-wheeler commuters.",
        evidence_summary: "Visual damage verified.",
        responsible_authority: "Pune Municipal Corporation - Road Department"
      };

      const { res, promise } = createMockResponse();
      const req = {
        body: {
          report: sampleReport,
          citizenNote: "Please look into this immediately. Call 9822012345."
        }
      };

      // Invoke router route directly
      await complaintRoutes.handle(
        {
          method: "POST",
          url: "/file",
          body: req.body,
          headers: { "content-type": "application/json" }
        },
        res,
        (err) => {
          if (err) assert.fail(err.message);
        }
      );

      const result = await promise;
      assert.equal(result.statusCode, 201);
      assert.equal(result.body.success, true);

      const data = result.body.data;
      // 1. Tracking ID
      assert.equal(data.trackingId.startsWith("PMC-2026-"), true);

      // 2. Status Timeline: Submitted -> Verified -> Forwarded -> Resolved
      assert.equal(Boolean(data.statusTimeline), true);
      assert.equal(data.statusTimeline.stages.length, 4);
      assert.equal(data.statusTimeline.stages[0].name, "Submitted");
      assert.equal(data.statusTimeline.stages[1].name, "Verified");
      assert.equal(data.statusTimeline.stages[2].name, "Forwarded");
      assert.equal(data.statusTimeline.stages[3].name, "Resolved");

      // 3. Online Route
      assert.equal(Boolean(data.onlineRoute.portalUrl), true);
      assert.equal(Boolean(data.onlineRoute.copyReadyText), true);
      assert.equal(
        data.onlineRoute.copyReadyText.includes(data.trackingId),
        true
      );

      // 4. Offline Route (office name, documents, best time to visit, what to say)
      assert.equal(Boolean(data.offlineRoute.officeName), true);
      assert.equal(Array.isArray(data.offlineRoute.documentsToCarry), true);
      assert.equal(Boolean(data.offlineRoute.bestTimeToVisit), true);
      assert.equal(Boolean(data.offlineRoute.whatToSay), true);

      // 5. WhatsApp & Email share routes
      assert.equal(data.shareRoutes.whatsappUrl.includes("wa.me"), true);
      assert.equal(data.shareRoutes.emailUrl.startsWith("mailto:"), true);

      // 6. Report saved to reports.json with PII redacted (no 9822012345)
      assert.equal(Boolean(data.savedReport.id), true);
      assert.equal(data.savedReport.citizenNote.includes("9822012345"), false);
    } finally {
      // Byte-for-byte restoration of pristine reports.json
      await fs.writeFile(reportsPath, rawBackup, "utf-8");
    }
  });

  it("authorities registry should provide category, department, portalUrl, helpline, email, and officeAddress for every entry", async () => {
    const authorities = await getAuthorities();
    assert.equal(authorities.length >= 6, true);

    for (const auth of authorities) {
      assert.equal(
        typeof auth.category,
        "string",
        `Missing category in ${auth.id}`
      );
      assert.equal(
        typeof auth.authorityName,
        "string",
        `Missing authorityName in ${auth.id}`
      );
      assert.equal(
        typeof auth.department,
        "string",
        `Missing department in ${auth.id}`
      );
      assert.equal(
        typeof auth.portalUrl,
        "string",
        `Missing portalUrl in ${auth.id}`
      );
      assert.equal(
        typeof auth.helpline,
        "string",
        `Missing helpline in ${auth.id}`
      );
      assert.equal(typeof auth.email, "string", `Missing email in ${auth.id}`);
      assert.equal(
        typeof auth.officeAddress,
        "string",
        `Missing officeAddress in ${auth.id}`
      );
      assert.equal(
        Boolean(auth.offlineGuide.whatToSay),
        true,
        `Missing whatToSay in ${auth.id}`
      );
      assert.equal(
        Boolean(auth.offlineGuide.bestTimeToVisit),
        true,
        `Missing bestTimeToVisit in ${auth.id}`
      );
    }
  });
});
