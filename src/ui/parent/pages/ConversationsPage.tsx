import { useMemo, useState } from 'react';
import { getSkill } from '../../../domain/curriculum';
import { LESSON_TITLES } from '../../../domain/lessons/registry';
import { isTeacherId } from '../../../domain/teachers/registry';
import { TEACHERS, type TeacherId } from '../../../domain/teachers/teachers';
import type { LessonAttempt, TeacherInteraction } from '../../../domain/types';
import { dayFromTimestamp, formatDay } from '../../../domain/util/time';
import { TeacherPortrait } from '../../child/TeacherPortrait';
import { Card, EmptyState, PageHeader } from '../components';
import type { ParentData } from '../ParentApp';

const OUTCOME_LABEL: Record<string, string> = { independent: 'On her own', supported: 'With a hint', not_yet: 'Not yet' };

function time(ts: string): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * Full transparency: every conversation the child has with a teacher is
 * stored locally and shown here, word for word.
 */
export function ConversationsPage({ data }: { data: ParentData }) {
  const { records, child } = data;
  const [teacher, setTeacher] = useState<'all' | TeacherId>('all');
  const [open, setOpen] = useState<string | null>(null);
  const items = useMemo(
    () => [...records.interactions].filter((i) => teacher === 'all' || i.teacherId === teacher).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [records.interactions, teacher],
  );
  const lessonFor = (i: TeacherInteraction): LessonAttempt | undefined =>
    records.lessons.find((l) => l.teacherId === i.teacherId && Math.abs(Date.parse(l.completedAt) - Date.parse(i.endedAt)) < 5 * 60_000);

  return (
    <div className="page">
      <PageHeader
        title="Teacher talk"
        subtitle={`Every conversation ${child.name} has with her teachers, word for word. Stored only on this device. ${
          data.household.settings.teacherAi.enabled && data.household.settings.teacherAi.consentToSend
            ? 'AI teachers are on: what she says to a teacher is sent (as text) through your AI helper to its AI service (OpenAI or Anthropic) to write the reply — those replies are marked “AI”.'
            : 'Teachers answer on this device — nothing is sent anywhere.'
        }`}
      />
      <div className="toolbar">
        <div className="chip-row">
          <button type="button" className={`chip ${teacher === 'all' ? 'active' : ''}`} onClick={() => setTeacher('all')}>
            All ({records.interactions.length})
          </button>
          {(Object.keys(TEACHERS) as TeacherId[]).map((t) => (
            <button key={t} type="button" className={`chip ${teacher === t ? 'active' : ''}`} onClick={() => setTeacher(t)}>
              {TEACHERS[t].name} ({records.interactions.filter((i) => i.teacherId === t).length})
            </button>
          ))}
        </div>
      </div>
      {items.length === 0 ? (
        <Card>
          <EmptyState>No conversations yet.</EmptyState>
        </Card>
      ) : (
        <div className="convo-list">
          {items.map((i) => {
            const t = isTeacherId(i.teacherId) ? TEACHERS[i.teacherId] : undefined;
            const lesson = lessonFor(i);
            const isOpen = open === i.id;
            return (
              <Card key={i.id} className="convo">
                <button type="button" className="convo-head" onClick={() => setOpen(isOpen ? null : i.id)} aria-expanded={isOpen}>
                  <TeacherPortrait id={i.teacherId as TeacherId} mood="happy" size={44} />
                  <div className="convo-summary">
                    <strong>{t?.name ?? 'Past teacher'}</strong>
                    <span className="muted small">
                      {formatDay(dayFromTimestamp(i.startedAt), 'weekday')} · {time(i.startedAt)} ·{' '}
                      {i.context.lessonId ? LESSON_TITLES[i.context.lessonId]?.childTitle : i.context.flow}
                    </span>
                    <span className="small">{i.outcome}</span>
                    {i.parentNotes?.length ? <span className="small flag-inline">💛 {i.parentNotes.join(' · ')}</span> : null}
                  </div>
                  <span className="muted small">{i.transcript.length} lines</span>
                  {i.isDemo && <span className="demo-tag">demo</span>}
                </button>
                {isOpen && (
                  <div className="convo-body">
                    <ol className="transcript">
                      {i.transcript.map((l, k) => (
                        <li key={k} className={`line line-${l.speaker}`}>
                          <span className="who">{l.speaker === 'teacher' ? (t?.name ?? 'Past teacher') : l.speaker === 'child' ? child.name : '·'}</span>
                          <span className="what">
                            {l.text}
                            {l.via === 'voice' && (
                              <span className="via-tag" title="Said out loud (speech-to-text)">
                                🎤
                              </span>
                            )}
                            {l.via === 'ai' && (
                              <span className="via-tag" title="Written by the AI teacher">
                                AI
                              </span>
                            )}
                          </span>
                          <span className="when muted small">{time(l.at)}</span>
                        </li>
                      ))}
                    </ol>
                    {lesson && (
                      <div className="lesson-detail">
                        <h3 className="mini-head">
                          Problem by problem · started at level {lesson.startTier + 1}, ended at level {lesson.endTier + 1}
                        </h3>
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Prompt</th>
                              <th>Skill</th>
                              <th>Her answers</th>
                              <th>Help given</th>
                              <th>Result</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lesson.problems.map((p, k) => (
                              <tr key={k}>
                                <td>{p.prompt}</td>
                                <td className="small">{getSkill(p.skillId)?.name ?? p.skillId}</td>
                                <td className="small">{p.responses.join(' → ')}</td>
                                <td className="small">{p.scaffolds.length ? p.scaffolds.join('; ') : '—'}</td>
                                <td>
                                  <span className={`indep indep-${p.outcome === 'not_yet' ? 'assisted' : p.outcome}`}>{OUTCOME_LABEL[p.outcome]}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
