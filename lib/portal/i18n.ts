import type { PortalLocale } from "@/types/database.types";

/**
 * Portal copy, English and Tagalog.
 *
 * A plain object, not an i18n library and not a routing change. The portal has
 * one audience and a few dozen strings; `next-intl` would add a dependency, a
 * middleware matcher and a URL segment to solve a problem this object solves.
 *
 * The STAFF app stays English-only. Staff are administrators who chose this
 * software; parents are the general public, and a bilingual guide page sitting
 * inside an English-only portal is worse than either consistent choice.
 *
 * House rules for the Tagalog: it is the Taglish a Philippine parent actually
 * reads. "Balanse", "resibo" and "bayad" are the words on the physical receipt;
 * inventing purer Tagalog for them would be less clear, not more respectful.
 */

export const LOCALES: PortalLocale[] = ["en", "tl"];

export const LOCALE_LABELS: Record<PortalLocale, string> = {
  en: "English",
  tl: "Tagalog",
};

const en = {
  // Sign in
  signIn: "Sign in",
  signInTitle: "Parent Portal",
  signInLead: "Enter the 16-digit number on your parent card, then your PIN.",
  cardNumber: "Card number",
  cardHint: "The long number under the barcode",
  pin: "PIN",
  pinHint: "6 digits",
  signOut: "Sign out",
  invalidLogin: "That card number or PIN is not correct.",
  lockedLogin:
    "This card is locked after too many wrong PINs. Please try again later, or ask the school office to reset it.",
  throttledLogin: "Too many attempts from this device. Please wait a few minutes.",
  attemptsLeft: (n: number) => `${n} ${n === 1 ? "try" : "tries"} left before this card locks.`,

  // PIN
  setPinTitle: "Choose your PIN",
  setPinLead:
    "The school gave you a temporary PIN. Choose your own now — only you should know it.",
  currentPin: "Temporary PIN",
  newPin: "New PIN",
  confirmPin: "Repeat new PIN",
  savePin: "Save PIN",
  pinMismatch: "The two PINs do not match.",
  pinTooCommon: "That PIN is too easy to guess. Please choose another.",
  pinFormat: "A PIN is exactly 6 digits.",
  pinWrong: "That is not your current PIN.",
  pinSaved: "Your PIN is saved.",
  forgotPin: "Forgotten your PIN?",
  forgotPinHelp:
    "Please visit the school office with your card. For your children's safety, a PIN can only be reset in person.",

  // Navigation
  navHome: "My children",
  navAttendance: "Attendance",
  navBalances: "Fees",
  navGive: "Give",
  navClaims: "My payments",
  navTelegram: "Notifications",

  // Children
  childrenTitle: "My children",
  outstanding: "Outstanding",
  settled: "Fully paid",
  notEnrolled: "Not enrolled this year",
  notEnrolledHelp:
    "This student is not enrolled for the current school year, so online payment is not available. Please settle at the school office.",
  viewAttendance: "Attendance",
  viewFees: "Fees",
  noChildren:
    "No children are linked to this card yet. Please ask the school office to check your records.",

  // Attendance
  attendanceTitle: "Attendance",
  arrived: "Entered",
  left: "Left",
  noScans: "No gate records yet.",
  scanDelayed: "Recorded late",
  limitedHistory:
    "You are seeing the last 7 days. The primary guardian on record can see the whole school year.",

  // Fees
  feesTitle: "Fees",
  feeDue: "Due",
  feeBalance: "Balance",
  paySelected: "Pay selected",
  nothingDue: "Nothing outstanding. Thank you.",
  selectFees: "Select the fees you are paying.",

  // Paying
  payTitle: "Send your payment",
  payStep1: "Send the exact amount to the PTA's GCash number.",
  payStep2: "Copy the reference number from your GCash receipt.",
  payStep3: "Fill it in below and attach a screenshot.",
  amount: "Amount",
  referenceNumber: "GCash reference number",
  referenceHint: "The number on your GCash receipt",
  proof: "Screenshot of your GCash receipt",
  proofHint: "Optional, but it gets your payment confirmed faster",
  submitClaim: "Submit",
  claimSubmitted:
    "Thank you. The school will confirm your payment and your official receipt will appear here.",
  balanceNotYetUpdated:
    "Your balance will update once the school confirms the transfer.",

  // Claims
  claimsTitle: "My payments",
  claimSubmittedStatus: "Waiting for the school",
  claimApproved: "Confirmed",
  claimRejected: "Not accepted",
  receiptNo: "Receipt",
  ackNo: "Acknowledgement",
  noClaims: "You have not sent any payments through this portal yet.",

  // Giving
  giveTitle: "Support our school",
  giveLead: "These are the PTA's current projects. Any amount helps.",
  donate: "Give now",
  pledge: "Promise a gift",
  pledgeAmount: "Amount you plan to give",
  pledgeBy: "By when (optional)",
  pledgeMade: "Thank you. Your promise is recorded.",
  raised: "raised",
  ofTarget: "of",
  myPledges: "My promises",
  noPrograms: "There are no open projects right now.",
  giveAnonymously: "Do not print my name",

  // Telegram
  telegramTitle: "Get a message when your child arrives",
  telegramLead:
    "Link Telegram and you will get a message — with a photo — every time your child passes the school gate.",
  telegramLinked: "Connected",
  telegramNotLinked: "Not connected yet",
  telegramConnect: "Open Telegram and connect",
  telegramWaiting: "Waiting for you in Telegram…",
  telegramDone: "Done! You are connected.",
  telegramUnlink: "Disconnect",
  telegramNotifications: "Send me gate messages",
  telegramNoBot:
    "The school has not finished setting up its Telegram bot yet. Please check back later.",
  telegramLinkExpired: "That link has expired. Tap the button again for a new one.",
  telegramUnlinked: "Disconnected. You will no longer get gate messages.",
  telegramTapToOpen: "Tap here to open Telegram",
  telegramDidNotOpen:
    "Did it not open? Copy this link and paste it into your browser:",
  telegramNewLink: "Get a new link",
  telegramLinkExpiresIn: "This link works for the next 15 minutes.",

  // Common
  loading: "Loading…",
  cancel: "Cancel",
  back: "Back",
  language: "Language",
  school: "School",
};

type Copy = typeof en;

const tl: Copy = {
  signIn: "Mag-sign in",
  signInTitle: "Portal ng Magulang",
  signInLead:
    "Ilagay ang 16-digit na numero sa inyong parent card, tapos ang inyong PIN.",
  cardNumber: "Numero ng card",
  cardHint: "Ang mahabang numero sa ilalim ng barcode",
  pin: "PIN",
  pinHint: "6 na numero",
  signOut: "Mag-sign out",
  invalidLogin: "Mali ang numero ng card o ang PIN.",
  lockedLogin:
    "Naka-lock ang card na ito dahil sa sobrang maling PIN. Subukan muli mamaya, o magpa-reset sa opisina ng paaralan.",
  throttledLogin:
    "Sobrang dami nang subok mula sa device na ito. Maghintay po ng ilang minuto.",
  attemptsLeft: (n: number) =>
    `${n} pang subok bago ma-lock ang card na ito.`,

  setPinTitle: "Pumili ng inyong PIN",
  setPinLead:
    "Binigyan kayo ng pansamantalang PIN ng paaralan. Pumili na po ng sarili ninyo — kayo lang dapat ang nakakaalam nito.",
  currentPin: "Pansamantalang PIN",
  newPin: "Bagong PIN",
  confirmPin: "Ulitin ang bagong PIN",
  savePin: "I-save ang PIN",
  pinMismatch: "Hindi magkatugma ang dalawang PIN.",
  pinTooCommon: "Masyadong madaling hulaan ang PIN na iyan. Pumili po ng iba.",
  pinFormat: "Ang PIN ay 6 na numero.",
  pinWrong: "Hindi iyan ang kasalukuyang PIN ninyo.",
  pinSaved: "Na-save na ang inyong PIN.",
  forgotPin: "Nakalimutan ang PIN?",
  forgotPinHelp:
    "Pumunta po sa opisina ng paaralan dala ang inyong card. Para sa kaligtasan ng inyong mga anak, personal lang po ang pag-reset ng PIN.",

  navHome: "Mga anak ko",
  navAttendance: "Attendance",
  navBalances: "Bayarin",
  navGive: "Tulong",
  navClaims: "Mga bayad ko",
  navTelegram: "Abiso",

  childrenTitle: "Mga anak ko",
  outstanding: "May balanse",
  settled: "Bayad na",
  notEnrolled: "Hindi naka-enroll ngayong taon",
  notEnrolledHelp:
    "Hindi naka-enroll ang estudyanteng ito sa kasalukuyang school year, kaya hindi available ang online na bayad. Magbayad po sa opisina ng paaralan.",
  viewAttendance: "Attendance",
  viewFees: "Bayarin",
  noChildren:
    "Wala pang anak na naka-link sa card na ito. Pakisuri po sa opisina ng paaralan.",

  attendanceTitle: "Attendance",
  arrived: "Pumasok",
  left: "Umalis",
  noScans: "Wala pang record sa gate.",
  scanDelayed: "Naitala nang huli",
  limitedHistory:
    "Nakikita ninyo ang huling 7 araw. Ang pangunahing guardian sa record ang nakakakita ng buong school year.",

  feesTitle: "Bayarin",
  feeDue: "Deadline",
  feeBalance: "Balanse",
  paySelected: "Bayaran ang napili",
  nothingDue: "Wala nang balanse. Maraming salamat.",
  selectFees: "Piliin ang mga bayaring babayaran ninyo.",

  payTitle: "Ipadala ang inyong bayad",
  payStep1: "Ipadala ang eksaktong halaga sa GCash number ng PTA.",
  payStep2: "Kopyahin ang reference number sa inyong GCash receipt.",
  payStep3: "Ilagay ito sa ibaba at maglakip ng screenshot.",
  amount: "Halaga",
  referenceNumber: "GCash reference number",
  referenceHint: "Ang numero sa inyong GCash receipt",
  proof: "Screenshot ng inyong GCash receipt",
  proofHint: "Opsyonal, pero mas mabilis makumpirma ang bayad ninyo",
  submitClaim: "Ipasa",
  claimSubmitted:
    "Salamat po. Kukumpirmahin ng paaralan ang inyong bayad at lilitaw dito ang opisyal na resibo.",
  balanceNotYetUpdated:
    "Mag-a-update ang balanse ninyo kapag nakumpirma na ng paaralan ang bayad.",

  claimsTitle: "Mga bayad ko",
  claimSubmittedStatus: "Hinihintay ang paaralan",
  claimApproved: "Nakumpirma",
  claimRejected: "Hindi tinanggap",
  receiptNo: "Resibo",
  ackNo: "Pagkilala",
  noClaims: "Wala pa kayong naipadalang bayad sa portal na ito.",

  giveTitle: "Tumulong sa ating paaralan",
  giveLead:
    "Ito ang kasalukuyang mga proyekto ng PTA. Malaking tulong ang kahit anong halaga.",
  donate: "Magbigay ngayon",
  pledge: "Mangako ng tulong",
  pledgeAmount: "Halagang balak ibigay",
  pledgeBy: "Hanggang kailan (opsyonal)",
  pledgeMade: "Salamat po. Naitala na ang inyong pangako.",
  raised: "nalikom",
  ofTarget: "sa",
  myPledges: "Mga pangako ko",
  noPrograms: "Wala pong bukas na proyekto sa ngayon.",
  giveAnonymously: "Huwag i-print ang pangalan ko",

  telegramTitle: "Makatanggap ng mensahe kapag dumating ang anak ninyo",
  telegramLead:
    "I-link ang Telegram at makakatanggap kayo ng mensahe — may larawan pa — tuwing dumadaan ang anak ninyo sa gate ng paaralan.",
  telegramLinked: "Nakakonekta",
  telegramNotLinked: "Hindi pa nakakonekta",
  telegramConnect: "Buksan ang Telegram at kumonekta",
  telegramWaiting: "Hinihintay kayo sa Telegram…",
  telegramDone: "Ayos! Nakakonekta na kayo.",
  telegramUnlink: "Idiskonekta",
  telegramNotifications: "Padalhan ako ng mensahe mula sa gate",
  telegramNoBot:
    "Hindi pa tapos i-setup ng paaralan ang kanilang Telegram bot. Balikan po mamaya.",
  telegramLinkExpired:
    "Expired na ang link na iyan. Pindutin muli ang button para sa bago.",
  telegramUnlinked:
    "Na-disconnect na. Hindi na kayo makakatanggap ng mensahe mula sa gate.",
  telegramTapToOpen: "Pindutin dito para buksan ang Telegram",
  telegramDidNotOpen:
    "Hindi nagbukas? Kopyahin ang link na ito at i-paste sa inyong browser:",
  telegramNewLink: "Kumuha ng bagong link",
  telegramLinkExpiresIn: "Gumagana ang link na ito sa loob ng 15 minuto.",

  loading: "Naglo-load…",
  cancel: "Kanselahin",
  back: "Bumalik",
  language: "Wika",
  school: "Paaralan",
};

const DICTIONARIES: Record<PortalLocale, Copy> = { en, tl };

export function t(locale: PortalLocale): Copy {
  return DICTIONARIES[locale] ?? en;
}

/** Peso amounts, always with the sign and two decimals. */
export function peso(amount: number | string | null | undefined): string {
  const value = Number(amount ?? 0);
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}
