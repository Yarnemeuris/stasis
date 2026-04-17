export type TrackingCarrier = "ups" | "usps" | "fedex" | "dhl";

const PATTERNS: { carrier: TrackingCarrier; regex: RegExp }[] = [
  // UPS: 1Z + 16 alphanumerics
  { carrier: "ups", regex: /^1Z[0-9A-Z]{16}$/i },
  // FedEx: 12 or 15 digits (most common consumer formats)
  { carrier: "fedex", regex: /^(\d{12}|\d{15})$/ },
  // USPS: 22-digit numeric (most common), or 13-char alphanumeric with letter suffix
  { carrier: "usps", regex: /^(\d{22}|[A-Z]{2}\d{9}US)$/i },
  // DHL: 10 digits
  { carrier: "dhl", regex: /^\d{10}$/ },
];

export function detectCarrier(trackingNumber: string | null | undefined): TrackingCarrier | null {
  if (!trackingNumber) return null;
  const trimmed = trackingNumber.replace(/\s+/g, "").trim();
  for (const { carrier, regex } of PATTERNS) {
    if (regex.test(trimmed)) return carrier;
  }
  return null;
}

export function trackingUrl(carrier: TrackingCarrier | null, trackingNumber: string): string | null {
  if (!carrier) return null;
  const encoded = encodeURIComponent(trackingNumber.trim());
  switch (carrier) {
    case "ups":
      return `https://www.ups.com/track?tracknum=${encoded}`;
    case "usps":
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encoded}`;
    case "fedex":
      return `https://www.fedex.com/fedextrack/?trknbr=${encoded}`;
    case "dhl":
      return `https://www.dhl.com/en/express/tracking.html?AWB=${encoded}`;
  }
}

export function carrierLabel(carrier: TrackingCarrier | null): string {
  switch (carrier) {
    case "ups":
      return "UPS";
    case "usps":
      return "USPS";
    case "fedex":
      return "FedEx";
    case "dhl":
      return "DHL";
    default:
      return "Unknown carrier";
  }
}
