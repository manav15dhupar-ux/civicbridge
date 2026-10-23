/**
 * @fileoverview Unit tests for Geo calculations, Verification Engine, and Authority Action Planner.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateHaversineDistance, isWithinPune } from "../utils/geo.js";
import { verifyComplaint } from "../services/verificationService.js";
import { generateActionPlan, matchAuthority } from "../services/actionPlanService.js";

describe("Geographic Utilities", () => {
  it("should accurately calculate Haversine distance in meters", () => {
    // Distance between PMC Main Building (18.5204, 73.8567) and FC Road (18.5284, 73.8423) is ~1.76 km (~1760 m)
    const distance = calculateHaversineDistance(18.5204, 73.8567, 18.5284, 73.8423);
    assert.equal(distance > 1500 && distance < 2000, true);
  });

  it("should return 0 meters for identical coordinates", () => {
    const distance = calculateHaversineDistance(18.5074, 73.8077, 18.5074, 73.8077);
    assert.equal(distance, 0);
  });

  it("should validate coordinates within Pune municipal boundaries", () => {
    assert.equal(isWithinPune(18.5204, 73.8567), true); // Pune Shivajinagar
    assert.equal(isWithinPune(19.0760, 72.8777), false); // Mumbai (Outside Pune)
    assert.equal(isWithinPune(28.6139, 77.2090), false); // Delhi (Outside Pune)
  });
});

describe("Verification Engine", () => {
  it("should detect duplicate reports within 200m radius", async () => {
    // Candidate located 50m from Kothrud report (18.5074, 73.8077)
    const candidate = {
      category: "Drainage & Sewage",
      subcategory: "Drain Overflow",
      severity: 4,
      description: "Overflowing gutter sewage water near Karve statue bus stop.",
      lat: 18.5076,
      lng: 73.8079
    };

    const verification = await verifyComplaint(candidate);

    assert.equal(verification.isCorroborated, true);
    assert.equal(verification.matches.length > 0, true);
    assert.equal(verification.otherReportersCount >= 6, true);
    assert.equal(verification.verificationScore >= 85, true);
    assert.equal(verification.matches[0].distanceMeters <= 200, true);
  });

  it("should mark isolated reports in new locations as new incidents", async () => {
    // Coordinate far from existing seed reports
    const candidate = {
      category: "Water Supply",
      subcategory: "Pipeline Leakage",
      severity: 3,
      description: "Water pipe leaking in isolated area.",
      lat: 18.4100,
      lng: 73.7200
    };

    const verification = await verifyComplaint(candidate);
    assert.equal(verification.isCorroborated, false);
    assert.equal(verification.matches.length, 0);
    assert.equal(verification.otherReportersCount, 0);
  });
});

describe("Authority Registry & Action Planner", () => {
  it("should route drainage issues to PMC Drainage Department with 24h SLA", async () => {
    const auth = await matchAuthority("Drainage & Sewage", "Drain Overflow");
    assert.equal(auth.id, "pmc_drainage");
    assert.equal(auth.slaHours, 24);
  });

  it("should route potholes to PMC Road Department with 72h SLA", async () => {
    const auth = await matchAuthority("Roads & Footpaths", "Potholes");
    assert.equal(auth.id, "pmc_road");
    assert.equal(auth.slaHours, 72);
  });

  it("should generate a complete 4-stage action plan with offline and online steps", async () => {
    const report = {
      category: "Roads & Footpaths",
      subcategory: "Potholes",
      severity: 4,
      description: "Severe pothole on Baner High Street.",
      location_text: "Baner High Street, Baner, Pune",
      lat: 18.5590,
      lng: 73.7868,
      urgency_reason: "High accident risk for two-wheelers.",
      responsible_authority: "Pune Municipal Corporation - Road Department"
    };

    const plan = await generateActionPlan(report);

    assert.equal(plan.phases.length, 4);
    assert.equal(plan.onlineFilingSteps.length > 0, true);
    assert.equal(Boolean(plan.offlineOfficeDetails.headOffice), true);
    assert.equal(Boolean(plan.copyReadyText), true);
    assert.equal(plan.authority.helpline, "1800 1030 222");
  });
});
