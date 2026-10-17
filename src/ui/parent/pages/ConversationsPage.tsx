import { useMemo, useState } from 'react';
import { getSkill } from '../../../domain/curriculum';
import { LESSON_TITLES } from '../../../domain/lessons/registry';
import { isAllowedHelperUrl } from '../../../domain/teachers/chatRemote';
import { isTeacherId } from '../../../domain/teachers/registry';
import { TEACHERS, type TeacherId } from '../../../domain/teachers/teachers';
import type { LessonAttempt, TeacherInteraction } from '../../../domain/types';
import { dayFromTimestamp, formatDay } from '../../../domain/util/time';
import { TeacherPortrait } from '../../child/TeacherPortrait';
import { Card, EmptyState, PageHeader } from '../components';
import type { ParentData } from '../ParentApp';

const OUTCOME_LABEL: Record<string, string> = {
  independent: 'On her own',
  supported: 'With a hint',
  not_yet: 'Not yet',
  skipped: 'Skipped',
  model_only: 'Viewed model · ungraded',
};

function time(ts: string): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Prefer the stable per-run link; retain temporal matching only for legacy interactions. */
export function findConversationLesson(lessons: LessonAttempt[], interaction: TeacherInteraction): LessonAttempt | undefined {
  const sameOwner = (lesson: LessonAttempt) => lesson.childId === interaction.childId && lesson.teacherId === interaction.teacherId;
  const exact = lessons.find((lesson) => sameOwner(lesson) && `${lesson.id}:talk` === interaction.id);
  if (exact) return exact;
  // A partially synced modern run must not display a different run's evidence.
  if (interaction.id.startsWith('base-ten-arithmetic:') || interaction.id.startsWith('base-ten:')) return undefined;
  return lessons.find((lesson) => sameOwner(lesson) && Math.abs(Date.parse(lesson.completedAt) - Date.parse(interaction.endedAt)) < 5 * 60_000);
}

/** Saved teacher conversations and activity summaries available to the parent. */
export function ConversationsPage({ data }: { data: ParentData }) {
  const { records, child } = data;
  const ai = data.household.settings.teacherAi;
  const aiChatOn = ai.enabled && ai.consentToSend && isAllowedHelperUrl(ai.endpoint);
  const [teacher, setTeacher] = useState<'all' | TeacherId>('all');
  const [open, setOpen] = useState<string | null>(null);
  const items = useMemo(
    () => [...records.interactions].filter((i) => teacher === 'all' || i.teacherId === teacher).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [records.interactions, teacher],
  );
  const lessonFor = (i: TeacherInteraction) => findConversationLesson(records.lessons, i);

  return (
    <div className="page">
      <PageHeader
        title="Teacher talk"
        subtitle={`Saved conversations and activity summaries for ${child.name}. Some activities save summaries rather than every line.`}
      />
      <Card>
        <div className="small" data-testid="conversation-privacy">
          <p>Saved records are stored in this browser. They may also be included in family sync when enabled, or in exports you make.</p>
          <p>
            <strong>Optional AI chat: {aiChatOn ? 'on' : 'off'}.</strong>{' '}
            {aiChatOn
              ? 'For AI replies, your helper and its AI service receive text: the learner’s first name, current message, recent conversation turns and book titles. AI replies are marked “AI”.'
              : 'Built-in chat replies run on this device.'}
          </p>
          <p>
            Voice and microphone sharing are controlled separately and may send text or audio to other services. Review them in{' '}
            <a href="#/parent/settings">Settings &amp; privacy</a>.
          </p>
        </div>
      </Card>
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
                        <table className="data-table" role="table">
                          <thead>
                            <tr>
                              <th scope="col">Prompt</th>
                              <th scope="col">Skill</th>
                              <th scope="col">Her answers</th>
                              <th scope="col">Help given</th>
                              <th scope="col">Result</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lesson.problems.map((p, k) => (
                              <tr key={k}>
                                <td data-label="Prompt">{p.prompt}</td>
                                <td className="small" data-label="Skill">
                                  {getSkill(p.skillId)?.name ?? p.skillId}
                                </td>
                                <td className="small" data-label="Answers">
                                  {p.responses.length ? p.responses.join(' → ') : 'No answer attempted'}
                                </td>
                                <td className="small" data-label="Help given">
                                  {p.scaffolds.length ? p.scaffolds.join('; ') : '—'}
                                </td>
                                <td data-label="Result">
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
