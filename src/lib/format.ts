const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const money = (minor: number) => inr.format(minor / 100);
export const when = (d: Date) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(d);
/** Date and time in India Standard Time, e.g. "10 Nov 2026, 6:35 pm IST". */
export const istDateTime = (d: Date) =>
  `${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(d)} IST`;
