import { useEffect, useState } from 'react';
import { entities } from '@/lib/sheetsStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Pencil, Trash2, X, GripVertical } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const COLORS = ['#0f172a', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
const ICONS = ['ShoppingCart', 'Car', 'Home', 'Utensils', 'Plane', 'Heart', 'GraduationCap', 'Briefcase', 'Gift', 'Zap'];

export default function Categories() {
  const { toast } = useToast();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // {id?, name, icon, color, parent_id}

  const load = () => {
    setLoading(true);
    entities.Category.list().then(setCategories).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openNew = () => setEditing({ name: '', icon: ICONS[0], color: COLORS[1], parent_id: '__none__' });
  const openEdit = (c) => setEditing({ ...c, parent_id: c.parent_id || '__none__' });

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
    } catch (err) {
      toast({ title: 'Could not save', description: err.message, variant: 'destructive' });
    }
  };

  const remove = async (c) => {
    await entities.Category.delete(c.id);
    load();
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
  };

  if (loading) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-semibold tracking-tight">Categories</h1>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> New</Button>
      </div>

      {topLevel.length === 0 && (
        <p className="text-sm text-muted-foreground">No categories yet. Create your first one.</p>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="categories">
          {(provided) => (
            <div className="space-y-2" ref={provided.innerRef} {...provided.droppableProps}>
              {topLevel.map((c, index) => (
                <Draggable key={c.id} draggableId={c.id} index={index}>
                  {(dragProvided) => (
                    <div className="space-y-1" ref={dragProvided.innerRef} {...dragProvided.draggableProps}>
                      <Card className="p-3 flex items-center gap-3">
                        <span {...dragProvided.dragHandleProps} className="text-muted-foreground cursor-grab">
                          <GripVertical className="w-4 h-4" />
                        </span>
                        <span className="w-4 h-4 rounded-full" style={{ background: c.color }} />
                        <span className="font-medium flex-1">{c.name}</span>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => remove(c)}><Trash2 className="w-4 h-4" /></Button>
                      </Card>
                      {childrenOf(c.id).map((sub) => (
                        <Card key={sub.id} className="p-3 flex items-center gap-3 ml-6">
                          <span className="w-3 h-3 rounded-full" style={{ background: sub.color }} />
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
              <h2 className="font-heading font-semibold">{editing.id ? 'Edit category' : 'New category'}</h2>
              <Button variant="ghost" size="icon" onClick={() => setEditing(null)}><X className="w-4 h-4" /></Button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cat-name">Name</Label>
                <Input id="cat-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus />
              </div>
              <div className="space-y-2">
                <Label>Parent (optional)</Label>
                <Select value={editing.parent_id} onValueChange={(v) => setEditing({ ...editing, parent_id: v })}>
                  <SelectTrigger><SelectValue placeholder="None (top level)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None (top level)</SelectItem>
                    {topLevel.filter((c) => c.id !== editing.id).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setEditing({ ...editing, color: col })}
                      className="w-7 h-7 rounded-full border-2"
                      style={{ background: col, borderColor: editing.color === col ? '#0f172a' : 'transparent' }}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Icon</Label>
                <Select value={editing.icon} onValueChange={(v) => setEditing({ ...editing, icon: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ICONS.map((ic) => (
                      <SelectItem key={ic} value={ic}>{ic}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full">Save</Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}