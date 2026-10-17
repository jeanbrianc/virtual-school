import assert from 'node:assert/strict';
import { it } from 'node:test';
import { getSkill, skillsForLesson } from '../../src/domain/curriculum';
import { getLesson } from '../../src/domain/lessons/registry';
import { parseTeacherAiInput, teacherSystemPrompt } from '../../src/domain/teachers/aiPrompt';
import { localTeacherReply } from '../../src/domain/teachers/chat';
import {
  TEACHER_IDS,
  TEACHER_REGISTRY,
  teacherActivities,
  teacherActivity,
  isTeacherId,
  teacherForInteraction,
  teacherRegistration,
  type TeacherId,
} from '../../src/domain/teachers/registry';
import { TEACHERS, teacherOpening, teacherDisplayName } from '../../src/domain/teachers/teachers';
import { createTeacher } from '../../src/engine/characters/teachers';
import { parseSpeakInput } from '../../scripts/ai-helper/openai';

it('every stable teacher has a complete profile, curriculum activity, local voice and scene', () => {
  assert.deepEqual(TEACHER_IDS, ['hoot', 'digit', 'pippa', 'tavi', 'nova']);
  assert.equal(new Set(TEACHER_IDS).size, TEACHER_IDS.length);
  for (const id of TEACHER_IDS) {
    const r = TEACHER_REGISTRY[id],
      p = TEACHERS[id];
    assert.equal(p.id, id);
    assert.ok(p.introductions.length);
    assert.ok(p.voice.rate > 0);
    assert.ok(p.naturalVoice.voice);
    assert.equal(teacherForInteraction(id), id);
    const lessonId = r.activity.kind === 'lesson' ? r.activity.lessonId : r.activity.kind === 'routine' ? 'everyday-sequencing' : 'story-chat';
    if (r.activity.kind === 'lesson') assert.equal(getLesson(lessonId)?.teacherId, id);
    const skills = skillsForLesson(lessonId);
    assert.ok(skills.length);
    assert.ok(skills.every((s) => getSkill(s.id) && r.domains.includes(s.domainId as never)));
    const opening = teacherOpening(id, { childName: 'Test Learner', firstMeeting: true, visitsToday: 0, booksCompleted: 0 }, 12);
    assert.deepEqual(opening, teacherOpening(id, { childName: 'Test Learner', firstMeeting: true, visitsToday: 0, booksCompleted: 0 }, 12));
    assert.ok(opening.join(' ').includes(p.name));
    const req = { teacherId: id, childName: 'Test Learner', utterance: 'What can we explore?', history: [], books: [] };
    assert.equal(localTeacherReply(req).source, 'local');
    assert.deepEqual(localTeacherReply(req), localTeacherReply(req));
    assert.ok(parseSpeakInput({ teacherId: id, text: 'Hello learner' }));
    assert.ok(parseTeacherAiInput({ teacherId: id, utterance: 'Hello learner', childName: 'Learner' }));
    assert.doesNotMatch(teacherSystemPrompt({ teacherId: id, childName: 'Learner', bookTitles: [] }), /far above|3–4-year-old girl|Izzy/);
  }
  assert.equal(teacherForInteraction('tank'), 'nova');
  assert.equal(teacherForInteraction('rocket'), 'digit');
});
it('unknown, retired and prototype IDs are rejected or shown safely; existing saved IDs remain valid', () => {
  for (const id of ['retired_teacher', 'toString', 'constructor', '__proto__']) {
    assert.equal(isTeacherId(id), false);
    assert.equal(teacherDisplayName(id), 'Past teacher');
    assert.equal(teacherRegistration(id), undefined);
    assert.equal(teacherForInteraction(id), undefined);
    assert.equal(parseSpeakInput({ teacherId: id, text: 'Hello' }), null);
    assert.equal(parseTeacherAiInput({ teacherId: id, utterance: 'Hello' }), null);
    assert.throws(() => createTeacher(id as TeacherId, 0), /Unknown teacher/);
    assert.match(localTeacherReply({ teacherId: id as TeacherId, childName: 'Learner', utterance: 'Hello', history: [], books: [] }).reply, /grown-up/);
  }
  for (const id of ['hoot', 'digit', 'pippa', 'tavi', 'nova']) {
    assert.equal(isTeacherId(id), true);
    assert.equal(teacherDisplayName(id), TEACHERS[id as TeacherId].name);
  }
});

it('shared activity choices preserve defaults and reject cross-teacher or unknown route keys', () => {
  const defaults = {
    hoot: { kind: 'reading' },
    digit: { kind: 'lesson', lessonId: 'moon-rocks' },
    pippa: { kind: 'lesson', lessonId: 'patterns-shapes' },
    tavi: { kind: 'routine' },
    nova: { kind: 'lesson', lessonId: 'sink-float' },
  };
  for (const teacher of TEACHER_IDS) {
    assert.deepEqual(TEACHER_REGISTRY[teacher].activity, defaults[teacher]);
    const choices = teacherActivities(teacher);
    assert.equal(new Set(choices.map((c) => c.id)).size, choices.length);
    assert.deepEqual(choices[0]?.activity, defaults[teacher]);
    for (const choice of choices) {
      assert.ok(choice.label && choice.description && choice.icon);
      assert.doesNotMatch(choice.label + choice.description, /<|>|https?:/);
      assert.equal(teacherActivity(teacher, choice.id), choice);
      if (choice.activity.kind === 'lesson') assert.equal(getLesson(choice.activity.lessonId)?.teacherId, teacher);
    }
  }
  assert.equal(teacherActivity('nova', 'moon-rocks'), undefined);
  for (const id of ['retired', '__proto__', 'constructor', 'toString']) {
    assert.deepEqual(teacherActivities(id), []);
    assert.equal(teacherActivity('digit', id), undefined);
  }
});
