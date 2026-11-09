/** Fixed IDs so seeding is idempotent across deploys. Prices are in minor units (paise). */
export const SEED_EVENTS = [
  {
    id: "6f1c1d0e-5a3b-4c55-9a0e-6b2d1e000001",
    title: "Monsoon Beats Live",
    venue: "NSCI Dome, Mumbai",
    startsAt: new Date("2027-01-23T14:00:00Z"),
    sections: [
      { name: "Platinum", rows: "ABCDE", perRow: 20, priceCents: 499900 },
      { name: "Gold", rows: "FGHIJKLMNO", perRow: 20, priceCents: 299900 },
      { name: "Silver", rows: "PQRSTUVWXY", perRow: 20, priceCents: 149900 },
    ], // 500 seats
  },
  {
    id: "6f1c1d0e-5a3b-4c55-9a0e-6b2d1e000002",
    title: "Indie Night",
    venue: "The Piano Man, New Delhi",
    startsAt: new Date("2027-02-06T15:30:00Z"),
    sections: [
      { name: "Front", rows: "ABC", perRow: 12, priceCents: 179900 },
      { name: "Standard", rows: "DEFGHIJ", perRow: 12, priceCents: 99900 },
    ], // 120 seats
  },
];
