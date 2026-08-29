// Birthday-card settings types + defaults, split out from the heavy
// birthday-card component so modules that only need the settings shape (e.g.
// page.tsx) don't pull the full canvas renderer into their bundle. This file
// is intentionally dependency-free and side-effect-free.

export type CardTemplateId =
  | "blue-balloons"
  | "dark-blue"
  | "gold"
  | "green"
  | "modern-corporate"
  | "pink-balloons"
  | "purple"
  | "rose-gold"
  | "floral"
  | "elegant";

export type BirthdayCardSettings = {
  fromText: string;
  hrEmail: string; // where the internal HR notification is sent
  defaultTemplate: CardTemplateId;
  randomTemplate: boolean;
  greetings: string[];
  defaultGreeting: string;
  randomGreeting: boolean;
  // Legacy fields kept only so old Firestore documents keep spreading
  // cleanly without crashing — no longer read by the UI.
  companyName?: string;
  logoDataUrl?: string;
  defaultMessage?: string;
  primaryColor?: string;
  accentColor?: string;
};

export const DEFAULT_GREETINGS: string[] = [
  "Wishing you a wonderful birthday and a successful year ahead.",
  "Happy Birthday! Wishing you happiness, health, and success.",
  "Have an amazing birthday filled with joy and happiness.",
  "Wishing you all the best on your special day.",
  "May your birthday bring you happiness and success throughout the year.",
];

export const DEFAULT_BIRTHDAY_CARD_SETTINGS: BirthdayCardSettings = {
  fromText: "ABU NADER GROUP OF COMPANIES MANAGEMENT & STAFF",
  hrEmail: "",
  defaultTemplate: "modern-corporate",
  randomTemplate: true,
  greetings: DEFAULT_GREETINGS,
  defaultGreeting: DEFAULT_GREETINGS[0],
  randomGreeting: true,
};
