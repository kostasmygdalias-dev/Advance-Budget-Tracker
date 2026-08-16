import {
  ShoppingCart, Car, Home, Utensils, Plane, Heart, GraduationCap, Briefcase, Gift, Zap,
  HelpCircle,
} from 'lucide-react';

// Category icon names are stored as plain strings in the sheet (see
// Categories.jsx) so they survive a round trip through Google Sheets —
// this maps those names back to the actual lucide component.
export const CATEGORY_ICON_NAMES = [
  'ShoppingCart', 'Car', 'Home', 'Utensils', 'Plane', 'Heart', 'GraduationCap', 'Briefcase', 'Gift', 'Zap',
];

const CATEGORY_ICON_MAP = {
  ShoppingCart, Car, Home, Utensils, Plane, Heart, GraduationCap, Briefcase, Gift, Zap,
};

export function CategoryIcon({ name, className }) {
  const Icon = CATEGORY_ICON_MAP[name] || HelpCircle;
  return <Icon className={className} />;
}

export function IconAvatar({ icon: Icon, color, className }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full shrink-0 ${className || 'w-9 h-9'}`}
      style={{ background: (color || '#94a3b8') + '22', color: color || '#64748b' }}
    >
      <Icon className="w-4 h-4" />
    </span>
  );
}
