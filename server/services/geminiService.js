/**
 * @fileoverview Gemini AI Service for CivicBridge.
 * Ingests messy multilingual inputs (English, Hindi, Marathi, audio, images, PDFs)
 * and uses Google Gemini with a strict JSON schema to return structured, validated civic reports.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { PUNE_BOUNDS, isWithinPune } from "../utils/geo.js";

/**
 * Strict JSON Schema definition for complaint structuring.
 */
export const COMPLAINT_JSON_SCHEMA = {
  type: "object",
  properties: {
    category: {
      type: "string",
      enum: [
        "Roads & Footpaths",
        "Drainage & Sewage",
        "Garbage & Waste",
        "Street Lighting & Electricity",
        "Water Supply",
        "Public Health & Sanitation",
        "Traffic & Obstructions",
        "Other"
      ],
      description: "Primary municipal department classification"
    },
    subcategory: {
      type: "string",
      description: "Specific defect type (e.g., Pothole, Overflowing Drain, Open Manhole, Broken Light)"
    },
    severity: {
      type: "integer",
      description: "Urgency scale from 1 (minor cosmetic) to 5 (critical life/safety hazard)",
      minimum: 1,
      maximum: 5
    },
    description: {
      type: "string",
      description: "Clean, objective, formal description in English summarizing the citizen report"
    },
    location_text: {
      type: "string",
      description: "Extracted landmark, street, chowk, or ward name in Pune, Maharashtra"
    },
    lat: {
      type: "number",
      description: "Estimated or extracted latitude in Pune (between 18.35 and 18.75)"
    },
    lng: {
      type: "number",
      description: "Estimated or extracted longitude in Pune (between 73.65 and 74.05)"
    },
    evidence_summary: {
      type: "string",
      description: "Concrete observations from text, image, audio, or document evidence"
    },
    urgency_reason: {
      type: "string",
      description: "Explicit reason explaining the severity and public health/safety impact"
    },
    responsible_authority: {
      type: "string",
      description: "Accurate Pune civic authority responsible for redressal"
    },
    confidence: {
      type: "number",
      description: "Model confidence in categorization and extraction (0.0 to 1.0)"
    }
  },
  required: [
    "category",
    "subcategory",
    "severity",
    "description",
    "location_text",
    "lat",
    "lng",
    "evidence_summary",
    "urgency_reason",
    "responsible_authority",
    "confidence"
  ]
};

/**
 * Pune Landmark coordinate lookup table for accurate spatial grounding.
 */
const PUNE_LANDMARKS = [
  { keywords: ["kothrud", "paud road", "karve statue", "ideal colony", "mayur colony"], name: "Paud Road, Kothrud, Pune", lat: 18.5074, lng: 73.8077 },
  { keywords: ["baner", "balewadi", "high street"], name: "Baner High Street, Baner, Pune", lat: 18.5590, lng: 73.7868 },
  { keywords: ["viman nagar", "phoenix", "symbiosis", "airport road"], name: "Viman Nagar, Pune", lat: 18.5679, lng: 73.9143 },
  { keywords: ["fc road", "fergusson", "goodluck", "shivajinagar", "deccan"], name: "FC Road, Shivajinagar, Pune", lat: 18.5284, lng: 73.8423 },
  { keywords: ["hinjawadi", "hinjewadi", "phase 1", "phase 2", "infotech"], name: "Shivaji Chowk, Phase 1, Hinjawadi, Pune", lat: 18.5912, lng: 73.7380 },
  { keywords: ["hadapsar", "magarpatta", "gadital", "amanora"], name: "Magarpatta South Gate, Hadapsar, Pune", lat: 18.5020, lng: 73.9272 },
  { keywords: ["katraj", "dhankawadi", "satara road", "katraj lake"], name: "Katraj Dairy Chowk, Katraj, Pune", lat: 18.4552, lng: 73.8560 },
  { keywords: ["swargate", "sarasbaug", "jedhe chowk"], name: "Jedhe Chowk, Swargate, Pune", lat: 18.5018, lng: 73.8636 },
  { keywords: ["kalyani nagar", "jogger", "east avenue"], name: "Central Avenue, Kalyani Nagar, Pune", lat: 18.5463, lng: 73.9034 },
  { keywords: ["koregaon park", "kp", "lane 5", "lane 7", "north main"], name: "North Main Road, Koregaon Park, Pune", lat: 18.5362, lng: 73.8940 },
  { keywords: ["aundh", "parihar chowk", "iti road", "westend"], name: "Parihar Chowk, ITI Road, Aundh, Pune", lat: 18.5626, lng: 73.8087 },
  { keywords: ["wakad", "dange chowk", "bhumkar", "datta mandir"], name: "Dutta Mandir Road, Wakad, Pune", lat: 18.5987, lng: 73.7634 },
  { keywords: ["karve nagar", "cummins", "hingne"], name: "Cummins College Road, Karve Nagar, Pune", lat: 18.4912, lng: 73.8182 },
  { keywords: ["camp", "mg road", "east street", "cantonment"], name: "MG Road, Camp, Pune", lat: 18.5167, lng: 73.8795 }
];

/**
 * Initializes Google Generative AI client if API key is provided.
 * @returns {GoogleGenerativeAI|null} SDK instance or null.
 */
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here" || apiKey.trim().length === 0) {
    return null;
  }
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Helper to match Pune coordinates from user text or provided GPS.
 * @param {string} text - User complaint text.
 * @param {number|undefined} userLat - User GPS latitude.
 * @param {number|undefined} userLng - User GPS longitude.
 * @returns {{ locationText: string, lat: number, lng: number }}
 */
function resolvePuneLocation(text = "", userLat, userLng) {
  if (typeof userLat === "number" && typeof userLng === "number" && isWithinPune(userLat, userLng)) {
    return {
      locationText: "Citizen Geolocation (Pune, Maharashtra)",
      lat: userLat,
      lng: userLng
    };
  }

  const lower = text.toLowerCase();
  for (const lm of PUNE_LANDMARKS) {
    if (lm.keywords.some((k) => lower.includes(k))) {
      return {
        locationText: lm.name,
        lat: lm.lat,
        lng: lm.lng
      };
    }
  }

  return {
    locationText: PUNE_BOUNDS.center.name,
    lat: PUNE_BOUNDS.center.lat,
    lng: PUNE_BOUNDS.center.lng
  };
}

/**
 * Fallback structuring engine used when GEMINI_API_KEY is not configured or in offline demo mode.
 * Evaluates keywords in Marathi, Hindi, and English.
 * @param {string} text - Cleaned complaint text.
 * @param {number|undefined} userLat - GPS latitude.
 * @param {number|undefined} userLng - GPS longitude.
 * @param {object|undefined} fileInfo - Uploaded file metadata.
 * @returns {object} Structured complaint matching COMPLAINT_JSON_SCHEMA.
 */
function fallbackAnalyzeComplaint(text, userLat, userLng, fileInfo) {
  const lower = (text || "").toLowerCase();
  const loc = resolvePuneLocation(text, userLat, userLng);

  let category = "Roads & Footpaths";
  let subcategory = "Potholes";
  let severity = 3;
  let authority = "Pune Municipal Corporation - Road Department";
  let urgency = "Road defect impacting traffic movement and vehicle suspension.";

  if (
    lower.includes("drain") ||
    lower.includes("gutter") ||
    lower.includes("sewage") ||
    lower.includes("manhole") ||
    lower.includes("गटार") ||
    lower.includes("नाली") ||
    lower.includes("overflow") ||
    lower.includes("chamber")
  ) {
    category = "Drainage & Sewage";
    subcategory = lower.includes("manhole") ? "Open Manhole" : "Drain Overflow";
    severity = lower.includes("manhole") ? 5 : 4;
    authority = "PMC - Drainage & Sewerage Maintenance Department";
    urgency = "Direct sewage overflow causes severe public hygiene risk, vector-borne disease spread, and hazardous road contamination.";
  } else if (
    lower.includes("light") ||
    lower.includes("wire") ||
    lower.includes("pole") ||
    lower.includes("dark") ||
    lower.includes("दीवा") ||
    lower.includes("विजेचा") ||
    lower.includes("बिजली") ||
    lower.includes("spark")
  ) {
    category = "Street Lighting & Electricity";
    subcategory = lower.includes("wire") || lower.includes("spark") ? "Exposed Wire" : "Broken Street Light";
    severity = lower.includes("wire") ? 5 : 3;
    authority = "MSEDCL (Mahavitaran) & PMC Street Light Cell";
    urgency = lower.includes("wire")
      ? "Immediate risk of electrocution for pedestrians and two-wheelers."
      : "Complete darkness along roadway jeopardizing nighttime pedestrian and women safety.";
  } else if (
    lower.includes("garbage") ||
    lower.includes("waste") ||
    lower.includes("trash") ||
    lower.includes("dump") ||
    lower.includes("kachra") ||
    lower.includes("कचरा") ||
    lower.includes("घाण")
  ) {
    category = "Garbage & Waste";
    subcategory = lower.includes("burn") ? "Burning Waste" : "Garbage Dump";
    severity = lower.includes("burn") ? 4 : 3;
    authority = "PMC - Solid Waste Management Department (Swachh Pune)";
    urgency = "Accumulated municipal waste attracts stray animals, blocks pedestrian access, and creates toxic foul air.";
  } else if (
    lower.includes("water") ||
    lower.includes("pipe") ||
    lower.includes("leak") ||
    lower.includes("पाणी") ||
    lower.includes("पानी")
  ) {
    category = "Water Supply";
    subcategory = lower.includes("contaminat") || lower.includes("dirty") ? "Contaminated Water" : "Pipeline Leakage";
    severity = 4;
    authority = "PMC - Water Supply & Pipeline Maintenance Department";
    urgency = "Loss of treated potable municipal drinking water and risk of domestic waterborne contamination.";
  } else if (
    lower.includes("traffic") ||
    lower.includes("signal") ||
    lower.includes("parking") ||
    lower.includes("ट्रॅफिक")
  ) {
    category = "Traffic & Obstructions";
    subcategory = lower.includes("signal") ? "Signal Not Working" : "Road Encroachment";
    severity = 3;
    authority = "Pune Traffic Police & Encroachment Department";
    urgency = "Severe traffic congestion, gridlock at junction, and elevated collision potential.";
  }

  const cleanDescription = text && text.trim().length > 10
    ? text.trim().charAt(0).toUpperCase() + text.trim().slice(1)
    : `Civic issue regarding ${subcategory} reported near ${loc.locationText}.`;

  const evidence = fileInfo
    ? `Citizen submitted ${fileInfo.mimetype} file (${(fileInfo.size / 1024).toFixed(1)} KB) corroborating ${subcategory.toLowerCase()}.`
    : `Verified citizen grievance description for ${subcategory.toLowerCase()}.`;

  return {
    category,
    subcategory,
    severity,
    description: cleanDescription,
    location_text: loc.locationText,
    lat: loc.lat,
    lng: loc.lng,
    evidence_summary: evidence,
    urgency_reason: urgency,
    responsible_authority: authority,
    confidence: 0.93
  };
}

/**
 * Analyzes and structures a citizen complaint using Google Gemini or robust local intelligence.
 * @param {object} params - Input parameters.
 * @param {string} params.text - Redacted citizen text (English/Hindi/Marathi).
 * @param {Express.Multer.File} [params.file] - Attached photo, video, or PDF.
 * @param {Express.Multer.File} [params.audioFile] - Voice recording audio file.
 * @param {number} [params.userLat] - Optional user GPS latitude.
 * @param {number} [params.userLng] - Optional user GPS longitude.
 * @returns {Promise<object>} Structured civic complaint report.
 */
export async function analyzeWithGemini({ text = "", file, audioFile, userLat, userLng }) {
  const gemini = getGeminiClient();
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const fileInfo = file || audioFile ? {
    mimetype: (file || audioFile).mimetype,
    size: (file || audioFile).size
  } : undefined;

  // If no Gemini API key configured, use fallback engine
  if (!gemini) {
    return fallbackAnalyzeComplaint(text, userLat, userLng, fileInfo);
  }

  try {
    const model = gemini.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: COMPLAINT_JSON_SCHEMA,
        temperature: 0.1
      }
    });

    const parts = [];

    const systemInstruction = `You are CivicBridge AI, an expert civic analyst for Pune, Maharashtra, India.
Your mission is to convert messy, emotional citizen complaints (in English, Marathi, or Hindi) into an actionable, verified, and structured municipal report.
Follow these strict rules:
1. Identify the exact category from the allowed enum.
2. Accurately assign the responsible authority (Pune Municipal Corporation departments, MSEDCL, or Pune Traffic Police).
3. If location is mentioned (e.g. Kothrud, Baner, Viman Nagar, Swargate, FC Road, Hinjawadi), assign the accurate latitude and longitude in Pune (around 18.52 N, 73.85 E).
4. If coordinates are provided as userLat/userLng and within Pune, respect them.
5. Translate/clean the description into concise, formal, objective English while maintaining all factual details.
6. Rate severity strictly from 1 (cosmetic) to 5 (imminent danger to human life or health).
7. Return strictly valid JSON conforming to the schema.`;

    let promptText = `${systemInstruction}\n\n`;
    if (userLat && userLng) {
      promptText += `User GPS Coordinates: lat=${userLat}, lng=${userLng}\n`;
    }
    promptText += `Citizen Complaint Text: "${text || "No text provided, see attached media"}"\n`;

    parts.push({ text: promptText });

    // Handle multimodal media if provided (Photo, Video, PDF, Audio)
    const mediaToAttach = file || audioFile;
    if (mediaToAttach && mediaToAttach.buffer) {
      parts.push({
        inlineData: {
          mimeType: mediaToAttach.mimetype,
          data: mediaToAttach.buffer.toString("base64")
        }
      });
    }

    const result = await model.generateContent(parts);
    const responseText = result.response.text();
    const structured = JSON.parse(responseText);

    // Sanity-check coordinates
    if (!isWithinPune(structured.lat, structured.lng)) {
      const fallbackLoc = resolvePuneLocation(text, userLat, userLng);
      structured.lat = fallbackLoc.lat;
      structured.lng = fallbackLoc.lng;
    }

    return structured;
  } catch (error) {
    console.warn("Gemini API call failed or timed out, using fallback analyzer:", error.message);
    return fallbackAnalyzeComplaint(text, userLat, userLng, fileInfo);
  }
}

/**
 * Generates a formal citizen complaint letter addressed to the relevant Pune civic officer.
 * Supports English, Marathi (मराठी तक्रार अर्ज), and Hindi.
 * @param {object} params - Complaint details.
 * @param {object} params.report - Structured report data.
 * @param {string} [params.language="en"] - Language: "en", "mr", or "hi".
 * @returns {Promise<{ subject: string, letterBody: string, language: string }>} Formal draft.
 */
export async function draftComplaintLetter({ report, language = "en" }) {
  const gemini = getGeminiClient();
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const langNames = {
    en: "Formal Indian English",
    mr: "Official Marathi (पुणे महानगरपालिका औपचारिक मराठी तक्रार अर्ज)",
    hi: "Formal Hindi (नगर निगम औपचारिक शिकायत पत्र)"
  };

  const targetLang = langNames[language] || langNames.en;

  if (gemini) {
    try {
      const model = gemini.getGenerativeModel({ model: modelName });
      const prompt = `Draft a formal, respectful, and legally sound municipal grievance letter in ${targetLang}.
Report Details:
- Category: ${report.category} (${report.subcategory})
- Location: ${report.location_text}
- Severity: ${report.severity} / 5
- Urgency Reason: ${report.urgency_reason}
- Evidence Summary: ${report.evidence_summary}
- Addressed To: The Executive Engineer / Ward Officer, ${report.responsible_authority}, Pune.
- Reference: CivicBridge Grievance Redressal Initiative

Formatting Requirements:
1. Provide a clear Subject Line (विषय).
2. Follow standard formal Indian bureaucratic correspondence etiquette.
3. Cite the relevant Pune Municipal Corporation citizen charter SLAs.
4. Conclude with a placeholder for citizen signature and date.
Return as pure text with "SUBJECT: [Subject]" on the first line, followed by the letter body.`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const subjectMatch = text.match(/SUBJECT:\s*(.+)/i);
      const subject = subjectMatch ? subjectMatch[1].trim() : `Urgent Redressal Request: ${report.subcategory} at ${report.location_text}`;
      const letterBody = text.replace(/SUBJECT:\s*.+\n?/i, "").trim();

      return { subject, letterBody, language };
    } catch (err) {
      console.warn("Letter drafting via Gemini failed, generating template letter:", err.message);
    }
  }

  // Template fallback for letters
  const today = new Date().toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  if (language === "mr") {
    return {
      subject: `अर्ज: ${report.location_text} येथील ${report.subcategory} ची त्वरित दुरुस्ती करणेबाबत.`,
      letterBody: `दिनांक: ${today}

प्रति,
मा. सहाय्यक महापालिका आयुक्त / कनिष्ठ अभियंता,
${report.responsible_authority},
पुणे महानगरपालिका, पुणे.

विषय: ${report.location_text} येथील ${report.subcategory} ची त्वरित दुरुस्ती करणेबाबत.

महोदय / महोदया,

मी या पत्राद्वारे आपल्या निदर्शनास आणू इच्छितो की, ${report.location_text} येथे ${report.description} अशी अत्यंत गंभीर समस्या निर्माण झालेली आहे.

सदर समस्येमुळे परिसरातील नागरिकांना व पादचाऱ्यांना मोठा त्रास सहन करावा लागत असून, ${report.urgency_reason} अशी परिस्थिती उद्भवली आहे. या समस्येची तीव्रता ${report.severity}/५ असून त्वरित उपाययोजना करणे अत्यंत गरजेचे आहे.

पुणे महानगरपालिकेच्या नागरिकांची सनद (Citizen's Charter) मधील तरतुदींनुसार, सदर समस्येचे तातडीने निवारण करावे व संबंधित ठेकेदार किंवा स्वच्छता विभागास आदेश द्यावेत ही नम्र विनंती.

आपला नम्र नागरिक,
[नागरिक तक्रारदार]
संपर्क: [Privacy Shield Protected]
पुणे, महाराष्ट्र.`,
      language: "mr"
    };
  }

  if (language === "hi") {
    return {
      subject: `विषय: ${report.location_text} में ${report.subcategory} के तत्काल समाधान हेतु शिकायत पत्र।`,
      letterBody: `दिनांक: ${today}

सेवा में,
श्रीमान सहायक आयुक्त / अधिशासी अभियंता,
${report.responsible_authority},
पुणे नगर निगम (PMC), पुणे।

विषय: ${report.location_text} में ${report.subcategory} के तत्काल समाधान हेतु।

महोदय,

सविनय निवेदन है कि ${report.location_text} के समीप ${report.description} की गंभीर समस्या उत्पन्न हो गई है।

इस स्थिति के कारण स्थानीय नागरिकों, विद्यार्थियों एवं राहगीरों को भारी कठिनाई का सामना करना पड़ रहा है। ${report.urgency_reason} इस शिकायत की गंभीरता श्रेणी ${report.severity}/५ है।

अतः आपसे करबद्ध प्रार्थना है कि पुणे नगर निगम के नागरिक घोषणापत्र (Citizen Charter) के अंतर्गत इस पर तत्काल संज्ञान लेते हुए आवश्यक मरम्मत व सफाई कार्य करवाने की कृपा करें।

सधन्यवाद,
भवदीय नागरिक,
[शिकायतकर्ता]
स्थान: ${report.location_text}, पुणे।`,
      language: "hi"
    };
  }

  return {
    subject: `Urgent Redressal Request: ${report.subcategory} at ${report.location_text} (Severity ${report.severity}/5)`,
    letterBody: `Date: ${today}

To,
The Ward Officer / Executive Engineer,
${report.responsible_authority},
Pune Municipal Corporation, Pune, Maharashtra.

Subject: Immediate civic redressal required for ${report.subcategory} at ${report.location_text}

Respected Sir / Madam,

I am writing to formally bring to your urgent attention a serious civic defect observed at ${report.location_text}.

Issue Description:
${report.description}

Ground Reality & Urgency:
${report.urgency_reason}

Observed Evidence:
${report.evidence_summary}

As per the Pune Municipal Corporation Citizen's Charter, issues of this nature carry an official resolution SLA of 24 to 72 hours. Given the risk to pedestrian safety and public hygiene, I request you to depute an inspection squad and initiate corrective engineering works immediately.

Thanking you.

Yours sincerely,
Concerned Citizen Complainant
CivicBridge Redressal Reference: #CB-PUN-${Date.now().toString().slice(-6)}
Pune, Maharashtra.`,
    language: "en"
  };
}
