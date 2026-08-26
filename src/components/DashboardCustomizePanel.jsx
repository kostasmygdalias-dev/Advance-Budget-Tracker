import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { GripVertical } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';

// Its own lazy-loaded chunk (see Dashboard.jsx) — @hello-pangea/dnd is
// ~30KB gzipped, worth downloading only when someone actually opens the
// customize panel rather than on every single Dashboard visit.
export default function DashboardCustomizePanel({ layout, onDragEnd, onToggleWidget, onDone }) {
  const { t } = useLanguage();
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-medium">{t('dashboard.customizePanelTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('dashboard.customizePanelSubtitle')}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onDone}>{t('dashboard.done')}</Button>
      </div>
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="dashboard-widgets">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
              {layout.map((w, index) => (
                <Draggable key={w.id} draggableId={w.id} index={index}>
                  {(dragProvided) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50"
                    >
                      <span {...dragProvided.dragHandleProps} className="text-muted-foreground cursor-grab">
                        <GripVertical className="w-4 h-4" />
                      </span>
                      <span className={`flex-1 text-sm ${w.visible ? '' : 'text-muted-foreground'}`}>{t(`dashboard.widgets.${w.id}`)}</span>
                      <Switch checked={w.visible} onCheckedChange={() => onToggleWidget(w.id)} />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </Card>
  );
}
