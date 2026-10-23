import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyUrgentHazardTriage } from "../services/hazardTriageService.js";
import { generateActionPlan } from "../services/actionPlanService.js";
import { renderImmediateSafetyCard } from "../../public/js/ui.js";

describe("Urgent hazard triage", () => {
  const cases = [
    {
      text: "There is an open manhole near the bus stop.",
      type: "open_manhole",
      subcategory: "Open Manhole",
      authorityId: "pmc_drainage"
    },
    {
      text: "A fallen power wire is hanging over the footpath.",
      type: "exposed_or_fallen_wire",
      subcategory: "Exposed Wire",
      authorityId: "msedcl_pmc_light"
    },
    {
      text: "Flooding has covered the road after the heavy rain.",
      type: "flooding",
      subcategory: "Flooding",
      authorityId: "pmc_drainage"
    },
    {
      text: "A major road collapse has left a deep cavity.",
      type: "major_road_collapse",
      subcategory: "Road Collapse",
      authorityId: "pmc_road"
    }
  ];

  for (const testCase of cases) {
    it(`marks ${testCase.type} as critical and routes to the responsible authority`, async () => {
      const report = {
        category: "Other",
        subcategory: "Other",
        severity: 2,
        description: testCase.text,
        urgency_reason: "A citizen reported a dangerous condition."
      };

      const result = applyUrgentHazardTriage(report, testCase.text);

      assert.equal(result.structuredReport.severity, 5);
      assert.equal(result.structuredReport.subcategory, testCase.subcategory);
      assert.equal(result.hazardTriage.type, testCase.type);
      assert.equal(result.hazardTriage.authorityId, testCase.authorityId);
      assert.equal(result.hazardTriage.emergencyContacts[0].number, "112");
      assert.match(result.structuredReport.urgency_reason, /immediate risk/i);

      const actionPlan = await generateActionPlan(
        result.structuredReport,
        result.hazardTriage
      );
      assert.equal(actionPlan.authority.id, testCase.authorityId);
      assert.equal(
        actionPlan.urgentHazard.authorityContact.number.length > 0,
        true
      );
    });
  }

  it("leaves ordinary reports unchanged", () => {
    const report = { category: "Roads & Footpaths", severity: 2 };
    const result = applyUrgentHazardTriage(
      report,
      "A small pothole needs repair."
    );

    assert.equal(result.structuredReport, report);
    assert.equal(result.hazardTriage, null);
  });

  it("renders an accessible red safety card with a call link", () => {
    const card = renderImmediateSafetyCard({
      label: "Open manhole",
      safetyAdvice: ["Stay away and warn others."],
      emergencyContacts: [{ name: "Emergency Services", number: "112" }],
      priorityRouting: "Call 112 first."
    });

    assert.match(card, /role="alert"/);
    assert.match(card, /Immediate safety advice/);
    assert.match(card, /href="tel:112"/);
    assert.match(card, /Stay away and warn others/);
  });
});
