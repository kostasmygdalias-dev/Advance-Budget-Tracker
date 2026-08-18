// Best-effort keyword -> icon guess for a freshly-typed category name, in
// English or Greek. Sourced from the same names/icons used in
// sheetsStore.js's DEFAULT_CATEGORIES, plus common real-world names people
// actually type (brand names, everyday words) that don't appear there.
// Returns null when nothing matches, rather than guessing something
// misleading — callers decide the fallback (keep current icon, inherit the
// parent's, etc).

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // strip Greek tonos / other diacritics
}

// Ordered most-specific-first: earlier entries win when a name could match
// more than one (e.g. "car insurance" should hit Shield, not Car).
const KEYWORD_ICON_MAP = [
  ['Shield', ['insurance', 'ασφαλει']],
  ['Key', ['rent', 'mortgage', 'ενοικι', 'δανει']],
  ['Zap', ['electric', 'power', 'ρευμα', 'ρευματ']],
  ['Droplet', ['water', 'νερ']],
  ['Wifi', ['internet', 'wifi', 'broadband']],
  ['Wrench', ['maintenance', 'repair', 'fix', 'συντηρησ', 'επισκευ']],
  ['Fuel', ['fuel', 'gas station', 'gasoline', 'petrol', 'καυσιμ', 'βενζιν']],
  ['Bus', ['bus', 'metro', 'subway', 'transit', 'train', 'λεωφορει', 'μετρο', 'τρενο']],
  ['ParkingCircle', ['parking', 'σταθμευσ']],
  ['Car', ['car', 'taxi', 'uber', 'lyft', 'αυτοκινητ', 'ταξι']],
  ['Carrot', ['farmers market', 'λαικ']],
  ['ShoppingCart', ['grocery', 'groceries', 'supermarket', 'σουπερμαρκετ', 'τροφιμ']],
  ['Coffee', ['coffee', 'cafe', 'café', 'espresso', 'καφε']],
  ['Package', ['delivery', 'takeout', 'take-away', 'takeaway']],
  ['Utensils', ['restaurant', 'dining', 'lunch', 'dinner', 'εστιατορ', 'φαγητο']],
  ['Smartphone', ['phone', 'mobile', 'τηλεφων', 'κινητο']],
  ['Tv', ['netflix', 'spotify', 'disney', 'hbo', 'prime video', 'youtube', 'streaming']],
  ['Laptop', ['software', 'subscription', 'app store', 'λογισμικ', 'συνδρομ']],
  ['Stethoscope', ['doctor', 'clinic', 'γιατρ']],
  ['Pill', ['pharmacy', 'medicine', 'φαρμακ']],
  ['Smile', ['dental', 'dentist', 'οδοντιατρ']],
  ['Dumbbell', ['gym', 'fitness', 'γυμναστηρι']],
  ['Plane', ['flight', 'airline', 'airfare', 'πτησ']],
  ['Hotel', ['hotel', 'airbnb', 'accommodation', 'διαμον']],
  ['Shirt', ['clothing', 'clothes', 'ρουχ']],
  ['Monitor', ['electronics', 'ηλεκτρονικ']],
  ['Sparkles', ['personal care', 'beauty', 'salon', 'φροντιδ']],
  ['Film', ['movie', 'cinema', 'ταινι']],
  ['Gamepad2', ['game', 'gaming', 'παιχνιδ']],
  ['Ticket', ['concert', 'event', 'εκδηλωσ']],
  ['GraduationCap', ['tuition', 'school', 'university', 'διδακτρ', 'σχολει']],
  ['BookOpen', ['book', 'βιβλι']],
  ['HandHeart', ['charity', 'donation', 'φιλανθρωπ', 'δωρε']],
  ['Gift', ['gift', 'present', 'δωρ']],
  ['Clapperboard', ['entertainment', 'ψυχαγωγι']],
  ['ShoppingBag', ['shopping', 'ψωνι']],
  ['Home', ['housing', 'στεγασ', 'σπιτ']],
  ['Briefcase', ['work', 'business', 'δουλει', 'εργασι']],
  ['Heart', ['health', 'υγει']],
];

export function guessIconForName(name) {
  const n = normalize(name);
  if (!n) return null;
  for (const [icon, keywords] of KEYWORD_ICON_MAP) {
    if (keywords.some((k) => n.includes(normalize(k)))) return icon;
  }
  return null;
}
