export interface ContentVerificationResult {
  valid: boolean;
  detectedMime?: string;
  reasonCode?: string;
}

export function verifyContentMime(
  data: Buffer,
  declaredMime: string,
  filename: string
): ContentVerificationResult {
  if (!data || data.length === 0) {
    return { valid: false, reasonCode: 'EMPTY_FILE' };
  }

  const normalizedDeclared = declaredMime.toLowerCase().trim();

  // 1. JPEG
  if (normalizedDeclared === 'image/jpeg' || normalizedDeclared === 'image/jpg') {
    if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
      return { valid: true, detectedMime: 'image/jpeg' };
    }
    return { valid: false, reasonCode: 'MIME_MISMATCH' };
  }

  // 2. PNG
  if (normalizedDeclared === 'image/png') {
    if (
      data.length >= 8 &&
      data[0] === 0x89 &&
      data[1] === 0x50 &&
      data[2] === 0x4e &&
      data[3] === 0x47 &&
      data[4] === 0x0d &&
      data[5] === 0x0a &&
      data[6] === 0x1a &&
      data[7] === 0x0a
    ) {
      return { valid: true, detectedMime: 'image/png' };
    }
    return { valid: false, reasonCode: 'MIME_MISMATCH' };
  }

  // 3. GIF
  if (normalizedDeclared === 'image/gif') {
    if (
      data.length >= 6 &&
      data[0] === 0x47 &&
      data[1] === 0x49 &&
      data[2] === 0x46 &&
      data[3] === 0x38 &&
      (data[4] === 0x37 || data[4] === 0x39) &&
      data[5] === 0x61
    ) {
      return { valid: true, detectedMime: 'image/gif' };
    }
    return { valid: false, reasonCode: 'MIME_MISMATCH' };
  }

  // 4. WEBP
  if (normalizedDeclared === 'image/webp') {
    if (
      data.length >= 12 &&
      data[0] === 0x52 &&
      data[1] === 0x49 &&
      data[2] === 0x46 &&
      data[3] === 0x46 && // RIFF
      data[8] === 0x57 &&
      data[9] === 0x45 &&
      data[10] === 0x42 &&
      data[11] === 0x50 // WEBP
    ) {
      return { valid: true, detectedMime: 'image/webp' };
    }
    return { valid: false, reasonCode: 'MIME_MISMATCH' };
  }

  // 5. PDF
  if (normalizedDeclared === 'application/pdf') {
    if (
      data.length >= 5 &&
      data[0] === 0x25 &&
      data[1] === 0x50 &&
      data[2] === 0x44 &&
      data[3] === 0x46 &&
      data[4] === 0x2d // %PDF-
    ) {
      return { valid: true, detectedMime: 'application/pdf' };
    }
    return { valid: false, reasonCode: 'MIME_MISMATCH' };
  }

  // 6. MP4
  if (normalizedDeclared === 'video/mp4') {
    if (
      data.length >= 8 &&
      data[4] === 0x66 &&
      data[5] === 0x74 &&
      data[6] === 0x79 &&
      data[7] === 0x70 // ftyp
    ) {
      return { valid: true, detectedMime: 'video/mp4' };
    }
    return { valid: false, reasonCode: 'MIME_MISMATCH' };
  }

  // 7. WEBM
  if (normalizedDeclared === 'video/webm' || normalizedDeclared === 'audio/webm') {
    if (
      data.length >= 4 &&
      data[0] === 0x1a &&
      data[1] === 0x45 &&
      data[2] === 0xdf &&
      data[3] === 0xa3 // EBML
    ) {
      return { valid: true, detectedMime: normalizedDeclared };
    }
    return { valid: false, reasonCode: 'MIME_MISMATCH' };
  }

  // 8. WAV
  if (normalizedDeclared === 'audio/wav' || normalizedDeclared === 'audio/x-wav') {
    if (
      data.length >= 12 &&
      data[0] === 0x52 &&
      data[1] === 0x49 &&
      data[2] === 0x46 &&
      data[3] === 0x46 && // RIFF
      data[8] === 0x57 &&
      data[9] === 0x41 &&
      data[10] === 0x56 &&
      data[11] === 0x45 // WAVE
    ) {
      return { valid: true, detectedMime: 'audio/wav' };
    }
    return { valid: false, reasonCode: 'MIME_MISMATCH' };
  }

  // 9. OGG
  if (
    normalizedDeclared === 'audio/ogg' ||
    normalizedDeclared === 'video/ogg' ||
    normalizedDeclared === 'application/ogg'
  ) {
    if (
      data.length >= 4 &&
      data[0] === 0x4f &&
      data[1] === 0x67 &&
      data[2] === 0x67 &&
      data[3] === 0x53 // OggS
    ) {
      return { valid: true, detectedMime: normalizedDeclared };
    }
    return { valid: false, reasonCode: 'MIME_MISMATCH' };
  }

  // 10. MP3
  if (normalizedDeclared === 'audio/mpeg' || normalizedDeclared === 'audio/mp3') {
    const isId3 = data.length >= 3 && data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33;
    const isFrameSync =
      data.length >= 2 &&
      data[0] === 0xff &&
      (data[1] === 0xfb || data[1] === 0xf3 || data[1] === 0xf2);
    if (isId3 || isFrameSync) {
      return { valid: true, detectedMime: 'audio/mpeg' };
    }
    return { valid: false, reasonCode: 'MIME_MISMATCH' };
  }

  // 11. AVIF
  if (normalizedDeclared === 'image/avif') {
    if (
      data.length >= 12 &&
      data[4] === 0x66 &&
      data[5] === 0x74 &&
      data[6] === 0x79 &&
      data[7] === 0x70 && // ftyp
      ((data[8] === 0x61 && data[9] === 0x76 && data[10] === 0x69 && data[11] === 0x66) ||
        (data[8] === 0x61 && data[9] === 0x76 && data[10] === 0x69 && data[11] === 0x73))
    ) {
      return { valid: true, detectedMime: 'image/avif' };
    }
    return { valid: false, reasonCode: 'MIME_MISMATCH' };
  }

  // Unverified or container formats (e.g. DOCX, XLSX, unknown types) -> FAIL CLOSED
  return { valid: false, reasonCode: 'UNVERIFIED_CONTENT_TYPE' };
}
