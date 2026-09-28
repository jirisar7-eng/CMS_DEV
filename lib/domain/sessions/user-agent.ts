/**
 * Privacy-safe deterministic User-Agent label derivation.
 * Zero external dependencies, no IP, no geolocation, no fingerprinting.
 */

export function formatSessionDeviceLabel(userAgent?: string | null): string {
  if (!userAgent || typeof userAgent !== "string") {
    return "Unknown device";
  }

  const ua = userAgent.trim();
  if (!ua) {
    return "Unknown device";
  }

  // Detect OS / Device Class
  let os: string | null = null;
  let deviceClass: string | null = null;

  const isIpad = /iPad/i.test(ua);
  const isIphone = /iPhone|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isWindows = /Windows|WinNT|Win32|Win64/i.test(ua);
  const isMac = !isIphone && !isIpad && /Macintosh|Mac OS X/i.test(ua);
  const isLinux = !isAndroid && /Linux|X11/i.test(ua);

  if (isIpad) {
    os = "iOS";
    deviceClass = "Tablet";
  } else if (isIphone) {
    os = "iOS";
    deviceClass = "Mobile";
  } else if (isAndroid) {
    os = "Android";
    deviceClass = /Mobile/i.test(ua) ? "Mobile" : "Tablet";
  } else if (isWindows) {
    os = "Windows";
  } else if (isMac) {
    os = "macOS";
  } else if (isLinux) {
    os = "Linux";
  }

  // Detect Browser (order matters: Edge before Chrome, Chrome before Safari)
  let browser: string | null = null;
  if (/Edg(?:e|A|iOS)?\//i.test(ua)) {
    browser = "Edge";
  } else if (/Chrome|CriOS/i.test(ua) && !/Edg/i.test(ua)) {
    browser = "Chrome";
  } else if (/Firefox|FxiOS/i.test(ua)) {
    browser = "Firefox";
  } else if (/Safari/i.test(ua) && !/Chrome|CriOS|Android/i.test(ua)) {
    browser = "Safari";
  }

  const parts: string[] = [];
  if (browser) {
    parts.push(browser);
  }
  if (os) {
    parts.push(os);
  }
  if (deviceClass) {
    parts.push(deviceClass);
  }

  if (parts.length === 0) {
    return "Unknown device";
  }

  return parts.join(" · ");
}
