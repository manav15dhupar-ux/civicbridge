/**
 * @fileoverview Unit tests for Privacy Shield PII redaction.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { redactSensitiveData } from "../services/redactService.js";

describe("Privacy Shield Redaction Service", () => {
  it("should redact 12-digit Aadhaar numbers and keep only last 4 digits", () => {
    const input =
      "Citizen complaints regarding manhole near shop. Complainant Aadhaar is 4521 8892 1042.";
    const result = redactSensitiveData(input);

    assert.equal(result.cleanedText.includes("4521 8892 1042"), false);
    assert.equal(result.cleanedText.includes("XXXX-XXXX-1042"), true);
    assert.equal(result.redactionLog.length, 1);
    assert.equal(result.redactionLog[0].type, "Aadhaar Identity Number");
  });

  it("should redact Indian 10-digit mobile numbers with +91 or direct format", () => {
    const input =
      "Pothole on Baner High street. Please call me on 9822012345 or +91 94220 99887 urgently.";
    const result = redactSensitiveData(input);

    assert.equal(result.cleanedText.includes("9822012345"), false);
    assert.equal(result.cleanedText.includes("94220 99887"), false);
    assert.equal(result.cleanedText.includes("+91 98***-**45"), true);
    assert.equal(result.redactionLog.length, 2);
  });

  it("should redact Pune vehicle registration plates (MH 12 / MH 14)", () => {
    const input =
      "A truck with plate MH 12 AB 1234 dumped construction debris on the road.";
    const result = redactSensitiveData(input);

    assert.equal(result.cleanedText.includes("MH 12 AB 1234"), false);
    assert.equal(result.cleanedText.includes("MH-12-XX-XXXX"), true);
    assert.equal(result.redactionLog.length, 1);
  });

  it("should redact personal name disclosures in Marathi and Hindi", () => {
    const inputMarathi = "रस्त्यावर खड्डा आहे. माझं नाव रमेश पाटील आहे.";
    const resultMarathi = redactSensitiveData(inputMarathi);
    assert.equal(
      resultMarathi.cleanedText.includes("[नागरिक तक्रारदार]"),
      true
    );

    const inputHindi = "नाली का पानी सड़क पर बह रहा है। मेरा नाम सुरेश है।";
    const resultHindi = redactSensitiveData(inputHindi);
    assert.equal(
      resultHindi.cleanedText.includes("[नागरिक तक्रारकर्ता]"),
      true
    );
  });

  it("should handle empty text gracefully", () => {
    const result = redactSensitiveData("");
    assert.equal(result.cleanedText, "");
    assert.equal(result.redactionLog.length, 0);
  });
});
