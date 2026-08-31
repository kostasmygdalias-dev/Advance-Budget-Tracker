// Shared helpers for anywhere a category picker or a category total needs
// to be aware of the parent/subcategory relationship (2 levels: a category
// either has no parent, or its parent has no parent).
import { PALETTE, UNCATEGORIZED_COLOR } from '@/lib/categoryIcons';

// Flattens categories into display order — each parent immediately
// followed by its own subcategories — so a Select can render them with
// indentation and still keep the underlying list a single flat map().
export function flattenCategoryTree(categories) {
  const byOrder = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0);
  const topLevel = categories.filter((c) => !c.parent_id).sort(byOrder);
  const result = [];
  topLevel.forEach((c) => {
    result.push({ ...c, depth: 0 });
    categories
      .filter((s) => s.parent_id === c.id)
      .sort(byOrder)
      .forEach((s) => result.push({ ...s, depth: 1 }));
  });
  return result;
}

// A parent category's "real" spend/budget total should include what was
// spent through its subcategories, not just transactions tagged to the
// parent directly — otherwise budgeting at the "Transport" level shows
// €0 spent when every transaction was actually tagged to "Fuel"/"Parking".
// For a subcategory id this naturally returns just its own amount, since
// nothing has it as a parent (categories are only ever 2 levels deep).
export function amountIncludingChildren(catId, amountByCategory, categories) {
  const own = amountByCategory[catId] || 0;
  const childrenTotal = categories
    .filter((c) => c.parent_id === catId)
    .reduce((s, c) => s + (amountByCategory[c.id] || 0), 0);
  return own + childrenTotal;
}

// Groups per-category totals (however they were scoped — one month, a date
// range, whatever the caller aggregated) into the "spending by category"
// shape both Dashboard and Reports render: one entry per top-level category
// (parent total rolled up via amountIncludingChildren above), its own
// subcategories broken out beneath it, plus a trailing "Uncategorized"
// entry when there's any. Both sorted by total, descending. Was written out
// nearly identically in both pages; this is that logic in one place.
export function buildCategoryReport(amountByCategory, countByCategory, categories, uncategorizedLabel) {
  const report = [];
  let currentGroup = null;
  flattenCategoryTree(categories).forEach((c) => {
    if (c.depth === 0) {
      const total = amountIncludingChildren(c.id, amountByCategory, categories);
      currentGroup = total > 0 ? {
        id: c.id, name: c.name, color: c.color || PALETTE[0], icon: c.icon,
        total, count: countByCategory[c.id] || 0, children: [],
      } : null;
      if (currentGroup) report.push(currentGroup);
    } else if (currentGroup && amountByCategory[c.id] > 0) {
      currentGroup.count += countByCategory[c.id] || 0;
      currentGroup.children.push({
        id: c.id, name: c.name, color: c.color || PALETTE[0], icon: c.icon,
        total: amountByCategory[c.id], count: countByCategory[c.id] || 0,
      });
    }
  });
  if (amountByCategory.uncategorized > 0) {
    report.push({
      id: 'uncategorized', name: uncategorizedLabel, color: UNCATEGORIZED_COLOR, icon: null,
      total: amountByCategory.uncategorized, count: countByCategory.uncategorized || 0, children: [],
    });
  }
  report.sort((a, b) => b.total - a.total);
  report.forEach((g) => g.children.sort((a, b) => b.total - a.total));
  return report;
}
