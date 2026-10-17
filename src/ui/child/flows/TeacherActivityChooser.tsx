import { useEffect, useRef, useState } from 'react';
import { teacherActivities, teacherActivity, type TeacherId } from '../../../domain/teachers/registry';
import { Choices, DialogueShell, type Speech } from '../DialogueShell';

/** Shared pre-activity chooser. Labels are reviewed registry text, rendered as text. */
export function TeacherActivityChooser({
  teacher,
  speech,
  onPick,
  onClose,
}: {
  teacher: TeacherId;
  speech: Speech;
  onPick: (activityId: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const picking = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    host.current?.querySelector<HTMLButtonElement>('[data-testid^="choice-"]')?.focus();
  }, []);
  return (
    <div
      ref={host}
      className="teacher-activity-chooser"
      data-testid="teacher-activity-chooser"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
        if (event.key === 'Tab') {
          const buttons = [...(host.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if ((event.shiftKey && index <= 0) || (!event.shiftKey && index === buttons.length - 1)) {
            event.preventDefault();
            buttons[event.shiftKey ? buttons.length - 1 : 0]?.focus();
          }
        }
      }}
    >
      <DialogueShell teacher={teacher} line="What would you like to explore?" speech={speech} onClose={onClose}>
        <Choices
          items={teacherActivities(teacher).map((choice) => ({ id: choice.id, label: choice.label, icon: choice.icon, hint: choice.description }))}
          state={Object.fromEntries(teacherActivities(teacher).map((choice) => [choice.id, busy ? 'disabled' : undefined])) as Record<string, 'disabled'>}
          onPick={async (id) => {
            if (picking.current || !teacherActivity(teacher, id)) return;
            picking.current = true;
            setBusy(true);
            setError('');
            try {
              await onPick(id);
            } catch {
              setError('That activity could not open. Please try again.');
              picking.current = false;
              setBusy(false);
            }
          }}
        />
        {error && <p role="alert">{error}</p>}
      </DialogueShell>
    </div>
  );
}
