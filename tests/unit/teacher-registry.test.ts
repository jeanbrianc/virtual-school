import assert from 'node:assert/strict';
import { it } from 'node:test';
import { getSkill, skillsForLesson } from '../../src/domain/curriculum';
import { getLesson } from '../../src/domain/lessons/registry';
import { parseTeacherAiInput, teacherSystemPrompt } from '../../src/domain/teachers/aiPrompt';
import { localTeacherReply } from '../../src/domain/teachers/chat';
import { TEACHER_IDS, TEACHER_REGISTRY, isTeacherId, teacherForInteraction, teacherRegistration, type TeacherId } from '../../src/domain/teachers/registry';
import { TEACHERS, teacherOpening, teacherDisplayName } from '../../src/domain/teachers/teachers';
import { createTeacher } from '../../src/engine/characters/teachers';
import { parseSpeakInput } from '../../scripts/ai-helper/openai';

it('every stable teacher has a complete profile, curriculum activity, local voice and scene', () => {
  assert.deepEqual(TEACHER_IDS, ['hoot', 'digit', 'pippa', 'nova']);
  assert.equal(new Set(TEACHER_IDS).size, TEACHER_IDS.length);
  for (const id of TEACHER_IDS) {
    const r = TEACHER_REGISTRY[id],
      p = TEACHERS[id];
    assert.equal(p.id, id);
    assert.ok(p.introductions.length);
    assert.ok(p.voice.rate > 0);
    assert.ok(p.naturalVoice.voice);
    assert.equal(teacherForInteraction(id), id);
    const lessonId = r.activity.kind === 'lesson' ? r.activity.lessonId : 'story-chat';
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
  for (const id of ['hoot', 'digit', 'pippa', 'nova']) {
    assert.equal(isTeacherId(id), true);
    assert.equal(teacherDisplayName(id), TEACHERS[id as TeacherId].name);
  }
});
