/**
 * @fileoverview Client-side EXIF GPS Extraction Utility for CivicBridge.
 * Inspects JPEG images in-memory to discover embedded GPS tags before upload,
 * allowing citizens to confirm photo locations before server-side EXIF scrubbing.
 */

/**
 * Extracts GPS coordinates from an uploaded image File or Blob.
 *
 * @param {File|Blob} file - Uploaded image file.
 * @returns {Promise<{ hasGps: boolean, lat?: number, lng?: number, error?: string }>}
 */
export async function extractExifGpsFromBlob(file) {
  if (!file || !file.type.startsWith("image/")) {
    return { hasGps: false };
  }

  try {
    // Read the first 128 KB which contains the entire EXIF APP1 header
    const slice = file.slice(0, 131072);
    const arrayBuffer = await slice.arrayBuffer();
    const view = new DataView(arrayBuffer);

    // Verify JPEG SOI (0xFFD8)
    if (view.getUint16(0) !== 0xFFD8) {
      return { hasGps: false };
    }

    let offset = 2;
    const length = view.byteLength;

    // Scan for APP1 marker (0xFFE1)
    while (offset < length - 4) {
      const marker = view.getUint16(offset);
      offset += 2;

      if (marker === 0xFFE1) {
        // Found APP1!
        const app1Length = view.getUint16(offset);
        const exifStart = offset + 2;

        // Check for 'Exif\0\0' string (0x457869660000)
        if (
          view.getUint32(exifStart) === 0x45786966 &&
          view.getUint16(exifStart + 4) === 0x0000
        ) {
          const tiffStart = exifStart + 6;
          return parseTiffForGps(view, tiffStart, app1Length);
        }
        break;
      } else if ((marker & 0xFF00) === 0xFF00) {
        // Variable-length marker, skip its payload
        const markerLength = view.getUint16(offset);
        offset += markerLength;
      } else {
        break;
      }
    }
  } catch (err) {
    console.debug("EXIF parsing note:", err);
  }

  return { hasGps: false };
}

/**
 * Parses TIFF header and IFD structures to locate GPS metadata.
 * @param {DataView} view - DataView of JPEG buffer.
 * @param {number} tiffStart - Byte offset where TIFF header begins.
 * @param {number} maxBytes - Maximum safe bytes in APP1 segment.
 * @returns {{ hasGps: boolean, lat?: number, lng?: number }}
 */
function parseTiffForGps(view, tiffStart, maxBytes) {
  // Endianness: 0x4949 ('II') = Little Endian, 0x4D4D ('MM') = Big Endian
  const byteOrder = view.getUint16(tiffStart);
  const littleEndian = byteOrder === 0x4949;

  // Verify TIFF magic 42 (0x002A)
  if (view.getUint16(tiffStart + 2, littleEndian) !== 0x002A) {
    return { hasGps: false };
  }

  // Offset to first IFD (IFD0)
  const ifd0Offset = view.getUint32(tiffStart + 4, littleEndian);
  if (ifd0Offset < 8 || ifd0Offset > maxBytes) {
    return { hasGps: false };
  }

  const ifd0Pos = tiffStart + ifd0Offset;
  const numEntries = view.getUint16(ifd0Pos, littleEndian);

  let gpsInfoOffset = 0;

  // Search IFD0 for Tag 0x8825 (GPSInfo pointer)
  for (let i = 0; i < numEntries; i++) {
    const entryPos = ifd0Pos + 2 + i * 12;
    if (entryPos + 12 > view.byteLength) break;

    const tag = view.getUint16(entryPos, littleEndian);
    if (tag === 0x8825) {
      gpsInfoOffset = view.getUint32(entryPos + 8, littleEndian);
      break;
    }
  }

  if (!gpsInfoOffset) {
    return { hasGps: false };
  }

  const gpsPos = tiffStart + gpsInfoOffset;
  if (gpsPos + 2 > view.byteLength) {
    return { hasGps: false };
  }

  const numGpsEntries = view.getUint16(gpsPos, littleEndian);
  let latRef = "N";
  let lngRef = "E";
  let latCoords = null;
  let lngCoords = null;

  for (let i = 0; i < numGpsEntries; i++) {
    const entryPos = gpsPos + 2 + i * 12;
    if (entryPos + 12 > view.byteLength) break;

    const tag = view.getUint16(entryPos, littleEndian);

    if (tag === 0x0001) {
      // GPSLatitudeRef ('N' or 'S')
      latRef = String.fromCharCode(view.getUint8(entryPos + 8));
    } else if (tag === 0x0002) {
      // GPSLatitude (3 rational numbers: degrees, minutes, seconds)
      const valueOffset = tiffStart + view.getUint32(entryPos + 8, littleEndian);
      latCoords = readRationals(view, valueOffset, 3, littleEndian);
    } else if (tag === 0x0003) {
      // GPSLongitudeRef ('E' or 'W')
      lngRef = String.fromCharCode(view.getUint8(entryPos + 8));
    } else if (tag === 0x0004) {
      // GPSLongitude (3 rational numbers: degrees, minutes, seconds)
      const valueOffset = tiffStart + view.getUint32(entryPos + 8, littleEndian);
      lngCoords = readRationals(view, valueOffset, 3, littleEndian);
    }
  }

  if (latCoords && lngCoords) {
    const lat = (latCoords[0] + latCoords[1] / 60 + latCoords[2] / 3600) * (latRef === "S" ? -1 : 1);
    const lng = (lngCoords[0] + lngCoords[1] / 60 + lngCoords[2] / 3600) * (lngRef === "W" ? -1 : 1);

    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return {
        hasGps: true,
        lat: Math.round(lat * 100000) / 100000,
        lng: Math.round(lng * 100000) / 100000
      };
    }
  }

  return { hasGps: false };
}

/**
 * Reads N rational numbers (numerator / denominator pairs).
 * @param {DataView} view
 * @param {number} offset
 * @param {number} count
 * @param {boolean} littleEndian
 * @returns {number[]} Array of computed decimal numbers.
 */
function readRationals(view, offset, count, littleEndian) {
  const result = [];
  for (let i = 0; i < count; i++) {
    const pos = offset + i * 8;
    if (pos + 8 > view.byteLength) return [0, 0, 0];
    const num = view.getUint32(pos, littleEndian);
    const den = view.getUint32(pos + 4, littleEndian);
    result.push(den === 0 ? 0 : num / den);
  }
  return result;
}
