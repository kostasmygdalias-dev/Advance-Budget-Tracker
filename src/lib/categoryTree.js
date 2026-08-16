// Shared helpers for anywhere a category picker or a category total needs
// to be aware of the parent/subcategory relationship (2 levels: a category
// either has no parent, or its parent has no parent).

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
