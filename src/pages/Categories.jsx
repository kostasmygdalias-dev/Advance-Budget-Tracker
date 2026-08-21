import { useEffect, useState } from 'react';
import { entities, addMissingDefaultCategories } from '@/lib/sheetsStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Pencil, Trash2, X, GripVertical, Sparkles } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import LoadError from '@/components/LoadError';
import PageSkeleton from '@/components/PageSkeleton';
import { CATEGORY_ICON_NAMES, CategoryIcon, IconAvatar } from '@/lib/categoryIcons';
import { guessIconForName } from '@/lib/categoryIconGuess';
import { useInvalidateCategories } from '@/hooks/useEntities';
import { useLanguage } from '@/lib/i18n';

const COLORS = ['#0f172a', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
const ICONS = CATEGORY_ICON_NAMES;

// Clicking the category's own icon swaps it directly from a grid — no need
// to open the full edit modal and hit Save just to change one icon.
function IconPickerButton({ icon, color, size, onPick }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="rounded-full transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <IconAvatar icon={(props) => <CategoryIcon name={icon} {...props} />} color={color} className={size} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="grid grid-cols-6 gap-1 max-h-64 overflow-y-auto">
          {ICONS.map((ic) => (
            <button
              key={ic}
              type="button"
              onClick={() => { onPick(ic); setOpen(false); }}
              className={`flex items-center justify-center rounded-md p-2 hover:bg-muted transition-colors ${ic === icon ? 'bg-muted ring-1 ring-primary' : ''}`}
              title={ic}
            >
              <CategoryIcon name={ic} className="w-4 h-4" />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function Categories() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editing, setEditing] = useState(null); // {id?, name, icon, color, parent_id}
  // Once the user manually picks a color/icon for a *new* category, stop
  // auto-guessing from the name/parent so we don't clobber their choice.
  const [colorTouched, setColorTouched] = useState(false);
  const [iconTouched, setIconTouched] = useState(false);
  const [addingDefaults, setAddingDefaults] = useState(false);
  const invalidateCategories = useInvalidateCategories();

  const load = () => {
    setLoading(true);
    setLoadError(null);
    entities.Category.list().then(setCategories).catch(setLoadError).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setColorTouched(false);
    setIconTouched(false);
    setEditing({ name: '', icon: ICONS[0], color: COLORS[1], parent_id: '__none__' });
  };
  const openEdit = (c) => {
    // Editing an existing category should never auto-change its color/icon.
    setColorTouched(true);
    setIconTouched(true);
    setEditing({ ...c, parent_id: c.parent_id || '__none__' });
  };

  const updateName = (name) => {
    setEditing((prev) => {
      const next = { ...prev, name };
      if (!prev.id && !iconTouched) {
        const guess = guessIconForName(name);
        if (guess) next.icon = guess;
      }
      return next;
    });
  };

  const updateParent = (parent_id) => {
    setEditing((prev) => {
      const next = { ...prev, parent_id };
      if (!prev.id && !colorTouched && parent_id !== '__none__') {
        const parent = categories.find((c) => c.id === parent_id);
        if (parent?.color) next.color = parent.color;
      }
      return next;
    });
  };

  const save = async (e) => {
    e.preventDefault();
    if (!editing.name.trim()) return;
    const parent_id = editing.parent_id && editing.parent_id !== '__none__' ? editing.parent_id : null;
    const siblings = categories.filter((c) => (c.parent_id || null) === parent_id && c.id !== editing.id);
    const payload = {
      name: editing.name.trim(),
      icon: editing.icon,
      color: editing.color,
      parent_id,
      sort_order: editing.id ? (editing.sort_order ?? 0) : siblings.length,
    };
    try {
      if (editing.id) {
        await entities.Category.update(editing.id, payload);
      } else {
        await entities.Category.create(payload);
      }
      setEditing(null);
      load();
      invalidateCategories();
    } catch (err) {
      toast({ title: t('common.couldNotSave'), description: err.message, variant: 'destructive' });
    }
  };

  const remove = async (c) => {
    await entities.Category.delete(c.id);
    load();
    invalidateCategories();
  };

  const changeIcon = async (c, icon) => {
    setCategories((prev) => prev.map((row) => (row.id === c.id ? { ...row, icon } : row)));
    try {
      await entities.Category.update(c.id, { icon });
      invalidateCategories();
    } catch (err) {
      setCategories((prev) => prev.map((row) => (row.id === c.id ? { ...row, icon: c.icon } : row)));
      toast({ title: t('common.couldNotSave'), description: err.message, variant: 'destructive' });
    }
  };

  const addDefaults = async () => {
    setAddingDefaults(true);
    try {
      const added = await addMissingDefaultCategories();
      load();
      invalidateCategories();
      toast({
        title: added === 0
          ? t('categories.allDefaultsExist')
          : (added === 1 ? t('categories.addedDefaultsOne', { count: added }) : t('categories.addedDefaultsOther', { count: added })),
      });
    } catch (err) {
      toast({ title: t('common.couldNotSave'), description: err.message, variant: 'destructive' });
    } finally {
      setAddingDefaults(false);
    }
  };

  const byOrder = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0);
  const topLevel = categories.filter((c) => !c.parent_id).sort(byOrder);
  const childrenOf = (id) => categories.filter((c) => c.parent_id === id).sort(byOrder);

  const onDragEnd = async (result) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const reordered = Array.from(topLevel);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setCategories((prev) => {
      const others = prev.filter((c) => c.parent_id);
      return [...reordered.map((c, i) => ({ ...c, sort_order: i })), ...others];
    });
    await Promise.all(
      reordered.map((c, i) => (c.sort_order === i ? null : entities.Category.update(c.id, { sort_order: i })))
    );
    invalidateCategories();
  };

  if (loading) return <PageSkeleton />;
  if (loadError) return <LoadError error={loadError} onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-heading font-semibold tracking-tight">{t('categories.title')}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={addDefaults} disabled={addingDefaults}>
            <Sparkles className="w-4 h-4 mr-1" /> {t('categories.addDefaults')}
          </Button>
          <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> {t('common.add')}</Button>
        </div>
      </div>

      {topLevel.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('categories.noneYet')}</p>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="categories">
          {(provided) => (
            <div className="space-y-2" ref={provided.innerRef} {...provided.droppableProps}>
              {topLevel.map((c, index) => (
                <Draggable key={c.id} draggableId={c.id} index={index}>
                  {(dragProvided) => (
                    <div className="space-y-1" ref={dragProvided.innerRef} {...dragProvided.draggableProps}>
                      <Card className="p-3 flex items-center gap-3" style={{ borderLeft: `4px solid ${c.color || '#94a3b8'}` }}>
                        <span {...dragProvided.dragHandleProps} className="text-muted-foreground cursor-grab">
                          <GripVertical className="w-4 h-4" />
                        </span>
                        <IconPickerButton icon={c.icon} color={c.color} onPick={(ic) => changeIcon(c, ic)} />
                        <span className="font-medium flex-1">{c.name}</span>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => remove(c)}><Trash2 className="w-4 h-4" /></Button>
                      </Card>
                      {childrenOf(c.id).map((sub) => (
                        <Card key={sub.id} className="p-3 flex items-center gap-3 ml-6" style={{ borderLeft: `4px solid ${sub.color || '#94a3b8'}` }}>
                          <IconPickerButton icon={sub.icon} color={sub.color} size="w-7 h-7" onPick={(ic) => changeIcon(sub, ic)} />
                          <span className="text-sm flex-1">{sub.name}</span>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(sub)}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => remove(sub)}><Trash2 className="w-4 h-4" /></Button>
                        </Card>
                      ))}
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={() => setEditing(null)}>
          <Card className="p-5 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-heading font-semibold">{editing.id ? t('categories.editCategory') : t('categories.newCategory')}</h2>
              <Button variant="ghost" size="icon" onClick={() => setEditing(null)}><X className="w-4 h-4" /></Button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cat-name">{t('categories.name')}</Label>
                <Input id="cat-name" value={editing.name} onChange={(e) => updateName(e.target.value)} autoFocus />
              </div>
              <div className="space-y-2">
                <Label>{t('categories.parentOptional')}</Label>
                <Select value={editing.parent_id} onValueChange={updateParent}>
                  <SelectTrigger><SelectValue placeholder={t('categories.noneTopLevel')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('categories.noneTopLevel')}</SelectItem>
                    {topLevel.filter((c) => c.id !== editing.id).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('categories.color')}</Label>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => { setColorTouched(true); setEditing({ ...editing, color: col }); }}
                      className="w-7 h-7 rounded-full border-2"
                      style={{ background: col, borderColor: editing.color === col ? '#0f172a' : 'transparent' }}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t('categories.icon')}</Label>
                <Select value={editing.icon} onValueChange={(v) => { setIconTouched(true); setEditing({ ...editing, icon: v }); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ICONS.map((ic) => (
                      <SelectItem key={ic} value={ic}>
                        <span className="flex items-center gap-2">
                          <CategoryIcon name={ic} className="w-4 h-4" /> {ic}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full">{t('common.save')}</Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}