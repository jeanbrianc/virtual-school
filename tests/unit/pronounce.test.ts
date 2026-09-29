/** Read-aloud: how the voices say her name, and which built-in voice they use. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cleanSayName, nameTestLine, sayNameSuggestions, speakableText } from '../../src/domain/pronounce';
import { pickVoice, rankVoices, type VoiceInfo } from '../../src/voice/SpeechService';

describe('saying her name', () => {
  it('respells every whole-word use of her name, whatever the case', () => {
    assert.equal(
      speakableText("Hoo-hoo! Welcome, Izzy! Is this Izzy's book? IZZY, look!", 'Izzy', 'Izzee'),
      "Hoo-hoo! Welcome, Izzee! Is this Izzee's book? Izzee, look!",
    );
    assert.equal(speakableText('Great job, izzy.', 'Izzy', 'Iz-ee'), 'Great job, Iz-ee.');
    assert.equal(speakableText('You’re a star, Izzy’s friend', 'Izzy', 'Izzee'), 'You’re a star, Izzee’s friend');
  });

  it('leaves longer words that only contain her name alone', () => {
    assert.equal(speakableText('Izzybelle and Dizzy and Izzy2', 'Izzy', 'Izzee'), 'Izzybelle and Dizzy and Izzy2');
  });

  it('works for the longer name too', () => {
    assert.equal(speakableText('Hello, Isabelle! Ready, Isabelle?', 'Isabelle', 'Izza-bell'), 'Hello, Izza-bell! Ready, Izza-bell?');
  });

  it('changes nothing without a respelling, or when it is just her name', () => {
    const line = 'Hoo-hoo! Welcome, Izzy!';
    assert.equal(speakableText(line, 'Izzy', undefined), line);
    assert.equal(speakableText(line, 'Izzy', ''), line);
    assert.equal(speakableText(line, 'Izzy', 'izzy'), line);
    assert.equal(speakableText(line, '', 'Izzee'), line);
  });

  it('never lets markup or symbols into what the voice reads', () => {
    assert.doesNotMatch(cleanSayName('  <phoneme ph="ɪzi">Iz</phoneme>ee!! '), /[<>"=/!]/);
    assert.equal(cleanSayName('Iz---ee'), 'Iz-ee');
    assert.equal(cleanSayName('Izza   bell'), 'Izza bell');
    assert.equal(cleanSayName('x'.repeat(80)).length, 40);
    assert.equal(speakableText('Hi Izzy', 'Izzy', '{Izzee}'), 'Hi Izzee');
  });

  it('suggests respellings for names voices often misread', () => {
    assert.ok(sayNameSuggestions('Izzy').includes('Izzee'));
    assert.ok(sayNameSuggestions(' isabelle ').includes('Izza-bell'));
    assert.deepEqual(sayNameSuggestions('Maya'), []);
    assert.match(nameTestLine('Izzee'), /Hello, Izzee!/);
  });
});

describe('choosing a built-in voice', () => {
  const v = (name: string, lang = 'en-US', isDefault = false): VoiceInfo => ({ name, lang, isDefault });
  // Roughly the list Chrome shows on a Mac: alphabetical, joke voices first.
  const mac = [
    v('Albert'),
    v('Bad News'),
    v('Bubbles'),
    v('Daniel', 'en-GB'),
    v('Eddy (English (US))'),
    v('Fred'),
    v('Karen', 'en-AU'),
    v('Samantha'),
    v('Zarvox'),
  ];

  it('prefers a clear US voice over joke, robot and regional voices', () => {
    assert.equal(pickVoice(mac)?.name, 'Samantha');
    const ranked = rankVoices(mac).map((x) => x.name);
    assert.ok(ranked.indexOf('Karen') < ranked.indexOf('Albert'));
    assert.ok(ranked.indexOf('Daniel') < ranked.indexOf('Eddy (English (US))'));
    const ordinary = ['Samantha', 'Karen', 'Daniel'];
    const novelty = ['Albert', 'Bad News', 'Bubbles', 'Eddy (English (US))', 'Fred', 'Zarvox'];
    assert.deepEqual(ranked.slice(0, 3).sort(), [...ordinary].sort());
    assert.deepEqual(ranked.slice(3).sort(), [...novelty].sort());
  });

  it('prefers enhanced voices and the device default among ordinary ones', () => {
    assert.equal(pickVoice([v('Samantha'), v('Ava (Premium)')])?.name, 'Ava (Premium)');
    assert.equal(
      pickVoice([v('Microsoft David - English (United States)'), v('Microsoft Zira - English (United States)')])?.name,
      'Microsoft Zira - English (United States)',
    );
    assert.equal(pickVoice([v('English United States'), v('English United States 2', 'en-US', true)])?.name, 'English United States 2');
  });

  it('uses the voice a parent chose when this device has it', () => {
    assert.equal(pickVoice(mac, 'Karen')?.name, 'Karen');
    assert.equal(pickVoice(mac, 'Bubbles')?.name, 'Bubbles');
    assert.equal(pickVoice(mac, 'Not On This Mac')?.name, 'Samantha');
    assert.equal(pickVoice(mac, '')?.name, 'Samantha');
    assert.equal(pickVoice([]), undefined);
  });
});
