import {
  ShoppingCart, Car, Home, Utensils, Plane, Heart, GraduationCap, Briefcase, Gift, Zap,
  Key, Droplet, Wifi, Wrench, Fuel, Bus, ParkingCircle, Shield, Carrot, Coffee, Package,
  Smartphone, Tv, Laptop, Stethoscope, Pill, Smile, Dumbbell, Hotel, Shirt, Monitor,
  Sparkles, Film, Gamepad2, Ticket, BookOpen, HandHeart, ShoppingBag, Clapperboard,
  HelpCircle,
} from 'lucide-react';
import { useIsDark } from '@/hooks/use-is-dark';

// Category icon names are stored as plain strings in the sheet (see
// Categories.jsx) so they survive a round trip through Google Sheets —
// this maps those names back to the actual lucide component.
export const CATEGORY_ICON_NAMES = [
  'ShoppingCart', 'Car', 'Home', 'Utensils', 'Plane', 'Heart', 'GraduationCap', 'Briefcase', 'Gift', 'Zap',
  'Key', 'Droplet', 'Wifi', 'Wrench', 'Fuel', 'Bus', 'ParkingCircle', 'Shield', 'Carrot', 'Coffee', 'Package',
  'Smartphone', 'Tv', 'Laptop', 'Stethoscope', 'Pill', 'Smile', 'Dumbbell', 'Hotel', 'Shirt', 'Monitor',
  'Sparkles', 'Film', 'Gamepad2', 'Ticket', 'BookOpen', 'HandHeart', 'ShoppingBag', 'Clapperboard',
];

// Fallback chart-slice colors for a category with no color of its own —
// shared by Dashboard's and Reports' category breakdowns.
export const PALETTE = ['#0f172a', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

// The color shown for "Uncategorized" and as a fallback when a category
// somehow has none — same literal was previously repeated inline in
// Categories, Dashboard, Reports, and Transactions.
export const UNCATEGORIZED_COLOR = '#94a3b8';

// Choices offered for a category's own color — Categories.jsx's picker, and
// ExpenseForm.jsx cycling through them for a quick-added category. One more
// color than PALETTE above (deliberately — this is the wider "assign a
// category a color" set, that one's just the chart-fallback set); shared
// here rather than each repeating the same 9 hex values.
export const CATEGORY_COLORS = ['#0f172a', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

const CATEGORY_ICON_MAP = {
  ShoppingCart, Car, Home, Utensils, Plane, Heart, GraduationCap, Briefcase, Gift, Zap,
  Key, Droplet, Wifi, Wrench, Fuel, Bus, ParkingCircle, Shield, Carrot, Coffee, Package,
  Smartphone, Tv, Laptop, Stethoscope, Pill, Smile, Dumbbell, Hotel, Shirt, Monitor,
  Sparkles, Film, Gamepad2, Ticket, BookOpen, HandHeart, ShoppingBag, Clapperboard,
};

export function CategoryIcon({ name, className }) {
  const Icon = CATEGORY_ICON_MAP[name] || HelpCircle;
  return <Icon className={className} />;
}

function hexToRgb(hex) {
  const c = hex.replace('#', '');
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function mixWithWhite(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  const mix = (channel) => Math.round(channel + (255 - channel) * amount).toString(16).padStart(2, '0');
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}

// Below this, a color reads as "basically black" — fine against a light
// card, but it (and an icon drawn in it) nearly vanishes against the app's
// own dark-mode background. Housing's near-black #0f172a is the one built-in
// category this hits, but the same fix applies to any custom category a
// user picks a very dark color for.
const DARK_LUMINANCE_THRESHOLD = 60;

function adjustForTheme(color, isDark) {
  if (!isDark || relativeLuminance(color) >= DARK_LUMINANCE_THRESHOLD) return color;
  return mixWithWhite(color, 0.75);
}

export function IconAvatar({ icon: Icon, color, className }) {
  const isDark = useIsDark();
  const base = adjustForTheme(color || UNCATEGORIZED_COLOR, isDark);
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full shrink-0 ${className || 'w-9 h-9'}`}
      style={{ background: base + '22', color: base }}
    >
      <Icon className="w-4 h-4" />
    </span>
  );
}
