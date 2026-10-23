export const BYTES_PER_KILOBYTE = 1024;
export const BYTES_PER_MEGABYTE = BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE;
export const MAX_FILE_SIZE_MEGABYTES = 20;

/**
 * Maximum permitted upload size for complaint evidence.
 * @type {number}
 */
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MEGABYTES * BYTES_PER_MEGABYTE;

/**
 * Distance used to identify nearby duplicate reports.
 * @type {number}
 */
export const DUPLICATE_DISTANCE_THRESHOLD_METERS = 200;

/**
 * Mean radius of the earth in meters for geographic distance calculations.
 * @type {number}
 */
export const EARTH_RADIUS_METERS = 6371000;

export const REQUEST_BODY_LIMIT = "1mb";
export const API_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const API_RATE_LIMIT_MAX_REQUESTS = 120;
export const ANALYZE_RATE_LIMIT_MAX_REQUESTS = 20;
export const GEOCODE_RATE_LIMIT_MAX_REQUESTS = 60;
export const LOCATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const LOCATION_CACHE_MAX_ENTRIES = 2000;
export const NOMINATIM_MIN_INTERVAL_MS = 1100;
export const GEMINI_REQUEST_TIMEOUT_MS = 25 * 1000;
export const DEFAULT_SLA_HOURS = 48;
export const MAX_COMPLAINT_TEXT_LENGTH = 4000;
export const MAX_REPORT_DESCRIPTION_LENGTH = 4000;
export const MAX_REPORT_SUBCATEGORY_LENGTH = 100;
export const MAX_LOCATION_TEXT_LENGTH = 400;
export const MAX_REPORT_LOCATION_LENGTH = 300;
export const MAX_EVIDENCE_SUMMARY_LENGTH = 2000;
export const MAX_URGENCY_REASON_LENGTH = 2000;
export const MAX_AUTHORITY_NAME_LENGTH = 300;
export const MAX_CITIZEN_NOTE_LENGTH = 1000;
export const MIN_REPORT_DESCRIPTION_LENGTH = 3;
export const MIN_REPORT_LOCATION_LENGTH = 2;

/**
 * Pune Municipal geographic bounding box coordinates for sanity checks.
 * @type {object}
 */
export const PUNE_BOUNDS = {
  minLat: 18.35,
  maxLat: 18.75,
  minLng: 73.65,
  maxLng: 74.05,
  center: {
    lat: 18.5204,
    lng: 73.8567,
    name: "Pune Municipal Corporation (PMC), Shivajinagar"
  }
};

/**
 * Life-safety hazards that bypass standard civic prioritization.
 * @type {Array<object>}
 */
export const URGENT_HAZARD_TYPES = [
  {
    type: "open_manhole",
    label: "Open manhole",
    patterns: [
      /\bopen\s+manhole\b/i,
      /\bmanhole\s+(?:is\s+)?(?:open|uncovered)\b/i,
      /\buncovered\s+manhole\b/i,
      /\bmissing\s+(?:the\s+)?manhole\s+cover\b/i
    ],
    category: "Drainage & Sewage",
    subcategory: "Open Manhole",
    authorityId: "pmc_drainage",
    authorityName: "PMC - Drainage & Sewerage Maintenance Department",
    secondaryContact: {
      name: "PMC Drainage Emergency Cell",
      number: "020-25501000"
    }
  },
  {
    type: "exposed_or_fallen_wire",
    label: "Exposed or fallen electrical wire",
    patterns: [
      /\b(?:exposed|fallen|downed|hanging|live)\s+(?:(?:electric(?:al)?|power)\s+)?(?:wire|cable|line)s?\b/i,
      /\b(?:wire|cable|line)\s+(?:is\s+)?(?:exposed|fallen|down|hanging)\b/i
    ],
    category: "Street Lighting & Electricity",
    subcategory: "Exposed Wire",
    authorityId: "msedcl_pmc_light",
    authorityName: "MSEDCL (Mahavitaran) & PMC Street Light Cell",
    secondaryContact: {
      name: "MSEDCL Electrical Emergency Line",
      number: "1912"
    }
  },
  {
    type: "flooding",
    label: "Flooding",
    patterns: [
      /\bflood(?:ing|ed)?\b/i,
      /\bwater[\s-]?logged\b/i,
      /\bwaterlogging\b/i,
      /\binundation\b/i
    ],
    category: "Drainage & Sewage",
    subcategory: "Flooding",
    authorityId: "pmc_drainage",
    authorityName: "PMC - Drainage & Sewerage Maintenance Department",
    secondaryContact: {
      name: "PMC Drainage Emergency Cell",
      number: "020-25501000"
    }
  },
  {
    type: "major_road_collapse",
    label: "Major road collapse",
    patterns: [
      /\b(?:major\s+)?road\s+(?:collapse[sd]?|caving\s+in|caved\s+in)\b/i,
      /\bsinkhole\b/i
    ],
    category: "Roads & Footpaths",
    subcategory: "Road Collapse",
    authorityId: "pmc_road",
    authorityName: "Pune Municipal Corporation - Road Department",
    secondaryContact: {
      name: "PMC Road Department",
      number: "18001030222"
    }
  }
];

/**
 * National emergency contact used for immediate life-safety threats in India.
 * @type {{ name: string, number: string }}
 */
export const NATIONAL_EMERGENCY_CONTACT = {
  name: "Emergency Services",
  number: "112"
};
