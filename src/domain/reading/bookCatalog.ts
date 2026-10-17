/**
 * Local book catalog: metadata + original comprehension questions for a
 * starter set of well-loved children's books. Questions are written for this
 * app (no text from the books is reproduced).
 *
 * The catalog sits behind BookMetadataService so an online metadata provider
 * (e.g. Open Library) can be added later as an explicit, parent-enabled option.
 */
import type { CoverStyle, MasteryRecord } from '../types';
import { effectiveLevel, masteryRank } from '../mastery/masteryEngine';

export type QuestionType = 'detail' | 'character' | 'feelings' | 'inference' | 'sequence' | 'theme' | 'vocab';

export interface ComprehensionQuestion {
  id: string;
  type: QuestionType;
  skillId: string;
  prompt: string;
  choices: string[];
  answerIndex: number;
  hint: string;
  /** Said after the answer (correct or modeled). */
  explain: string;
}

export interface CatalogBook {
  id: string;
  title: string;
  author: string;
  totalChapters?: number;
  totalPages?: number;
  band: string;
  tags: string[];
  cover: CoverStyle;
  moments: string[];
  questions: ComprehensionQuestion[];
  /** Reviewed primary-text basis for this question bank, not an endorsement. */
  provenance?: { sourceUrl: string; reviewedOn: string; edition: string; contentNote: string };
}

const QUESTION_SKILL: Record<QuestionType, string> = {
  detail: 'read.key-details',
  character: 'read.characters',
  feelings: 'read.feelings',
  inference: 'read.inference',
  sequence: 'read.retell',
  theme: 'read.theme',
  vocab: 'vocab.context',
};

type Q = Omit<ComprehensionQuestion, 'id' | 'skillId'>;
const qs = (bookId: string, list: Q[]): ComprehensionQuestion[] => list.map((q, i) => ({ ...q, id: `${bookId}.q${i + 1}`, skillId: QUESTION_SKILL[q.type] }));

export const BOOK_CATALOG: CatalogBook[] = [
  {
    id: 'peter-rabbit',
    title: 'The Tale of Peter Rabbit',
    author: 'Beatrix Potter',
    totalPages: 72,
    band: 'Pre-K – Grade 2 (read-aloud classic)',
    tags: ['animals', 'classic'],
    cover: { background: '#9fb8a0', accent: '#f3ead3', motif: 'rabbit' },
    moments: ['Squeezing under the gate', 'Hiding in the watering can', 'Losing his blue jacket', 'Chamomile tea at bedtime'],
    questions: qs('peter-rabbit', [
      {
        type: 'detail',
        prompt: 'Where did Peter’s mother tell him NOT to go?',
        choices: ['Mr. McGregor’s garden', 'The big dark forest', 'The river'],
        answerIndex: 0,
        hint: 'Think about the place with lettuces, beans and radishes…',
        explain: 'Mr. McGregor’s garden — and Peter went anyway!',
      },
      {
        type: 'inference',
        prompt: 'Why do you think Peter felt unwell at the end of the day?',
        choices: ['He ate too much and had a scary chase', 'He stayed up too late', 'He fell out of a tree'],
        answerIndex: 0,
        hint: 'Remember all the vegetables… and all that running from Mr. McGregor.',
        explain: 'He ate lots of vegetables AND had a big scare. That would make anyone tired and tummy-achy!',
      },
    ]),
  },
  {
    id: 'frog-and-toad',
    title: 'Frog and Toad Are Friends',
    author: 'Arnold Lobel',
    totalChapters: 5,
    totalPages: 64,
    band: 'Grades K–2',
    tags: ['animals', 'friendship'],
    cover: { background: '#8fae6b', accent: '#f6e7b8', motif: 'frog' },
    moments: ['Waking Toad up for spring', 'The lost button', 'The silly bathing suit', 'The letter that came by snail'],
    questions: qs('frog-and-toad', [
      {
        type: 'feelings',
        prompt: 'Why was Toad sad sitting on his front porch?',
        choices: ['He never got any mail', 'He lost his hat', 'It was raining'],
        answerIndex: 0,
        hint: 'He was waiting for something to arrive in his mailbox…',
        explain: 'Toad had never received a letter, so waiting for the mail made him feel sad.',
      },
      {
        type: 'theme',
        prompt: 'What do Frog and Toad show us about being friends?',
        choices: ['Friends help and are patient with each other', 'Friends never disagree', 'Friends have to look the same'],
        answerIndex: 0,
        hint: 'Think about how Frog helped Toad feel better.',
        explain: 'Good friends help each other — even when it takes a long time, like a snail delivering a letter!',
      },
    ]),
  },
  {
    id: 'hungry-caterpillar',
    title: 'The Very Hungry Caterpillar',
    author: 'Eric Carle',
    totalPages: 26,
    band: 'Pre-K – K',
    tags: ['animals', 'life-cycles'],
    cover: { background: '#e9c46a', accent: '#2a9d8f', motif: 'caterpillar' },
    moments: ['Eating through the fruit', 'The big Saturday feast', 'Building the cocoon', 'Becoming a butterfly'],
    questions: qs('hungry-caterpillar', [
      {
        type: 'sequence',
        prompt: 'What did the caterpillar become at the very end?',
        choices: ['A beautiful butterfly', 'A ladybug', 'A little bird'],
        answerIndex: 0,
        hint: 'After the cocoon, he came out with wings…',
        explain: 'He turned into a beautiful butterfly — that’s a life cycle!',
      },
    ]),
  },
  {
    id: 'mercy-watson',
    title: 'Mercy Watson to the Rescue',
    author: 'Kate DiCamillo',
    totalChapters: 13,
    totalPages: 72,
    band: 'Grades 1–3',
    tags: ['animals', 'humor'],
    cover: { background: '#f4a6a6', accent: '#fff4dc', motif: 'pig' },
    moments: ['The bed crashing through the floor', 'Mercy heading next door', 'The firefighters arriving', 'Hot buttered toast!'],
    questions: qs('mercy-watson', [
      {
        type: 'detail',
        prompt: 'What is Mercy Watson’s favorite food?',
        choices: ['Hot buttered toast', 'Pancakes', 'Apples'],
        answerIndex: 0,
        hint: 'It’s warm, it’s golden, and it has lots of butter…',
        explain: 'Hot buttered toast — with a great deal of butter!',
      },
      {
        type: 'inference',
        prompt: 'When Mercy left the house, what was she really thinking about?',
        choices: ['Getting something to eat', 'Calling the fire department', 'Finding a new bed'],
        answerIndex: 0,
        hint: 'Everyone called her a hero… but what does Mercy think about most of the time?',
        explain: 'Mercy was mostly thinking about food — that’s why the story is so funny!',
      },
    ]),
  },
  {
    id: 'henry-and-mudge',
    title: 'Henry and Mudge: The First Book',
    author: 'Cynthia Rylant',
    totalChapters: 3,
    totalPages: 40,
    band: 'Grades K–2',
    tags: ['animals', 'friendship'],
    cover: { background: '#a3c4dc', accent: '#fdf3e1', motif: 'dog' },
    moments: ['Henry wishing for a dog', 'Tiny puppy Mudge', 'Mudge growing HUGE', 'Finding each other again'],
    questions: qs('henry-and-mudge', [
      {
        type: 'character',
        prompt: 'Who is Mudge?',
        choices: ['Henry’s very big dog', 'Henry’s little sister', 'A cat next door'],
        answerIndex: 0,
        hint: 'Mudge started out as a tiny puppy…',
        explain: 'Mudge is Henry’s dog — and he grew to be enormous!',
      },
      {
        type: 'feelings',
        prompt: 'How did Henry feel when Mudge was lost?',
        choices: ['Worried and sad', 'Happy and excited', 'Sleepy'],
        answerIndex: 0,
        hint: 'How would you feel if your best friend was missing?',
        explain: 'Henry was worried — Mudge is his best friend. They were so glad to find each other.',
      },
    ]),
  },
  {
    id: 'little-bear',
    title: 'Little Bear',
    author: 'Else Holmelund Minarik',
    totalChapters: 4,
    totalPages: 64,
    band: 'Grades K–1',
    tags: ['animals', 'family'],
    cover: { background: '#c9a57a', accent: '#fff6e3', motif: 'bear' },
    moments: ['Asking for warm clothes', 'Birthday soup', 'Pretending to fly to the moon', 'A wish for Mother Bear'],
    questions: qs('little-bear', [
      {
        type: 'detail',
        prompt: 'Where did Little Bear pretend to fly?',
        choices: ['To the moon', 'To the ocean', 'To a castle'],
        answerIndex: 0,
        hint: 'Look up at night — it’s big, round and glowing…',
        explain: 'To the moon! He had a big imagination.',
      },
      {
        type: 'inference',
        prompt: 'Little Bear kept asking for warm clothes. What did Mother Bear point out he already had?',
        choices: ['His own fur coat', 'A thick blanket', 'A warm fire'],
        answerIndex: 0,
        hint: 'What is a bear covered in?',
        explain: 'His fur! Little Bear already had a warm coat of his own.',
      },
    ]),
  },
  {
    id: 'owl-at-home',
    title: 'Owl at Home',
    author: 'Arnold Lobel',
    totalChapters: 5,
    totalPages: 64,
    band: 'Grades K–2',
    tags: ['animals', 'humor'],
    cover: { background: '#6d7fa6', accent: '#f7e8b0', motif: 'owl' },
    moments: ['Winter coming to visit', 'The strange bumps in bed', 'Tear-water tea', 'The moon following Owl home'],
    questions: qs('owl-at-home', [
      {
        type: 'inference',
        prompt: 'What were the mysterious bumps at the bottom of Owl’s bed?',
        choices: ['His own feet', 'Two sleepy mice', 'Extra pillows'],
        answerIndex: 0,
        hint: 'What moves when Owl wiggles his toes?',
        explain: 'They were his own feet under the blanket — silly Owl!',
      },
    ]),
  },
  {
    id: 'amelia-bedelia',
    title: 'Amelia Bedelia',
    author: 'Peggy Parish',
    totalPages: 64,
    band: 'Grades 1–3',
    tags: ['humor', 'words'],
    cover: { background: '#e76f51', accent: '#fff1d6', motif: 'house' },
    moments: ['Dressing the chicken', 'Drawing the drapes', 'Dusting the furniture', 'The lemon meringue pie'],
    questions: qs('amelia-bedelia', [
      {
        type: 'detail',
        prompt: 'When the list said “dress the chicken,” what did Amelia Bedelia do?',
        choices: ['Put little clothes on it', 'Cooked it for dinner', 'Gave it a bath'],
        answerIndex: 0,
        hint: 'Amelia Bedelia always does exactly what the words say…',
        explain: 'She put clothes on it! She took the words literally.',
      },
      {
        type: 'vocab',
        prompt: 'Mrs. Rogers wrote “draw the drapes.” What did she really mean?',
        choices: ['Close the curtains', 'Draw a picture of the curtains', 'Wash the curtains'],
        answerIndex: 0,
        hint: 'In a house, “draw” can also mean “pull closed.”',
        explain: '“Draw the drapes” means close the curtains — words can have more than one meaning!',
      },
    ]),
  },
  {
    id: 'dinosaurs-before-dark',
    title: 'Dinosaurs Before Dark',
    author: 'Mary Pope Osborne',
    totalChapters: 10,
    totalPages: 80,
    band: 'Grades 1–3',
    tags: ['dinosaurs', 'adventure'],
    cover: { background: '#5e8c61', accent: '#f2d492', motif: 'dino' },
    moments: ['Finding the tree house', 'Meeting a Pteranodon', 'Running from the T. rex', 'The golden medallion'],
    questions: qs('dinosaurs-before-dark', [
      {
        type: 'character',
        prompt: 'Who are the brother and sister who find the magic tree house?',
        choices: ['Jack and Annie', 'Henry and Mudge', 'Frog and Toad'],
        answerIndex: 0,
        hint: 'One loves books and notes; the other is brave and curious.',
        explain: 'Jack and Annie!',
      },
      {
        type: 'detail',
        prompt: 'Which flying creature helped Jack escape?',
        choices: ['A Pteranodon', 'A Triceratops', 'A Stegosaurus'],
        answerIndex: 0,
        hint: 'It could fly — it had big leathery wings.',
        explain: 'A Pteranodon swooped in and carried Jack to safety.',
      },
    ]),
  },
  {
    id: 'charlottes-web',
    title: 'Charlotte’s Web',
    author: 'E. B. White',
    totalChapters: 22,
    totalPages: 184,
    band: 'Grades 3–5',
    tags: ['animals', 'friendship', 'classic', 'farm'],
    cover: { background: '#d8c3a5', accent: '#8e5b3a', motif: 'spider' },
    moments: ['Fern saving the runt', 'The first words in the web', 'Templeton at the fair', 'Charlotte’s egg sac'],
    questions: qs('charlottes-web', [
      {
        type: 'feelings',
        prompt: 'Why was Wilbur so scared?',
        choices: ['He learned the farmer planned to make him into dinner', 'He was afraid of the dark barn', 'He lost Templeton'],
        answerIndex: 0,
        hint: 'The old sheep told Wilbur something frightening about Christmas…',
        explain: 'Wilbur found out the farmer was planning to butcher him — that’s why he needed Charlotte’s help.',
      },
      {
        type: 'detail',
        prompt: 'What did Charlotte do to save Wilbur?',
        choices: ['Wrote words about him in her web', 'Hid him in the woods', 'Asked the farmer nicely'],
        answerIndex: 0,
        hint: 'People came from miles away to see something written in the barn doorway…',
        explain: 'She spun words like “Some Pig” into her web so everyone would think Wilbur was special.',
      },
      {
        type: 'theme',
        prompt: 'What does Charlotte teach us about friendship?',
        choices: ['A true friend helps you, even when it’s hard', 'Friends should always be the same animal', 'Friendship only lasts a day'],
        answerIndex: 0,
        hint: 'Charlotte worked very hard for Wilbur, day and night.',
        explain: 'A true friend helps you even when it’s hard work. Charlotte was a true friend.',
      },
    ]),
  },
  {
    id: 'my-fathers-dragon',
    title: 'My Father’s Dragon',
    author: 'Ruth Stiles Gannett',
    totalChapters: 10,
    totalPages: 88,
    band: 'Grades 2–4',
    tags: ['adventure', 'animals'],
    cover: { background: '#7fb3c8', accent: '#f7d06b', motif: 'dragon' },
    moments: ['Stowing away on a ship', 'Tricking the tigers', 'The crocodile bridge', 'Flying away with the dragon'],
    questions: qs('my-fathers-dragon', [
      {
        type: 'detail',
        prompt: 'Why did Elmer travel to Wild Island?',
        choices: ['To rescue a baby dragon', 'To find treasure', 'To visit his grandmother'],
        answerIndex: 0,
        hint: 'The old alley cat told Elmer about someone who needed help…',
        explain: 'He went to rescue a baby dragon who was being kept on the island.',
      },
      {
        type: 'inference',
        prompt: 'Why were the Wild Island animals keeping the dragon?',
        choices: ['They made him carry them across the river', 'They wanted to keep him warm', 'He was their king'],
        answerIndex: 0,
        hint: 'The dragon could fly, and the island had a very wide river…',
        explain: 'They were using the dragon to fly them across the river — which wasn’t fair to him.',
      },
    ]),
  },
  {
    id: 'velveteen-rabbit',
    title: 'The Velveteen Rabbit',
    author: 'Margery Williams',
    totalPages: 44,
    band: 'Grades 1–3',
    tags: ['classic', 'toys'],
    cover: { background: '#e8c7b8', accent: '#6b4f3f', motif: 'rabbit' },
    moments: ['The Skin Horse explaining Real', 'Sleeping in the Boy’s bed', 'Summer in the garden', 'The nursery magic Fairy'],
    questions: qs('velveteen-rabbit', [
      {
        type: 'character',
        prompt: 'Who explained to the Rabbit what it means to be Real?',
        choices: ['The Skin Horse', 'The Boy', 'A garden rabbit'],
        answerIndex: 0,
        hint: 'It was the oldest and wisest toy in the nursery.',
        explain: 'The wise old Skin Horse.',
      },
      {
        type: 'theme',
        prompt: 'What makes a toy become Real in this story?',
        choices: ['Being loved for a long, long time', 'Being brand new and shiny', 'Having batteries'],
        answerIndex: 0,
        hint: 'The Skin Horse said it doesn’t happen all at once…',
        explain: 'Being truly loved for a long time makes you Real.',
      },
    ]),
  },
  {
    id: 'winnie-the-pooh',
    title: 'Winnie-the-Pooh',
    author: 'A. A. Milne',
    totalChapters: 10,
    totalPages: 176,
    band: 'Grades 2–4',
    tags: ['classic', 'animals', 'friendship'],
    cover: { background: '#f2c14e', accent: '#7a4e2d', motif: 'bear' },
    moments: ['Pooh and the honey balloon', 'Stuck in Rabbit’s door', 'The Heffalump trap', 'Eeyore’s birthday'],
    questions: qs('winnie-the-pooh', [
      {
        type: 'detail',
        prompt: 'What does Pooh love to eat most of all?',
        choices: ['Honey', 'Carrots', 'Fish'],
        answerIndex: 0,
        hint: 'Bees make it!',
        explain: 'Honey — Pooh can never have too much.',
      },
      {
        type: 'inference',
        prompt: 'Why did Pooh get stuck in Rabbit’s front door?',
        choices: ['He ate so much that he got too round', 'The door shrank', 'Rabbit locked it'],
        answerIndex: 0,
        hint: 'What did Pooh do the whole time he visited Rabbit?',
        explain: 'He ate a LOT at Rabbit’s house and got too round to fit back out!',
      },
    ]),
  },
  {
    id: 'nate-the-great',
    title: 'Nate the Great',
    author: 'Marjorie Weinman Sharmat',
    totalPages: 64,
    band: 'Grades 1–3',
    tags: ['mystery', 'art'],
    cover: { background: '#9aa7b8', accent: '#fbe7c6', motif: 'magnifier' },
    moments: ['Pancakes for breakfast', 'Meeting Fang', 'Searching Annie’s house', 'Solving the color clue'],
    questions: qs('nate-the-great', [
      {
        type: 'detail',
        prompt: 'What does Nate the Great love to eat?',
        choices: ['Pancakes', 'Pizza', 'Ice cream'],
        answerIndex: 0,
        hint: 'He eats them for breakfast before every case.',
        explain: 'Pancakes! Detectives need a good breakfast.',
      },
      {
        type: 'inference',
        prompt: 'Annie’s yellow picture seemed to vanish. What really happened to it?',
        choices: ['Red paint over it turned it orange', 'The dog ate it', 'The wind blew it away'],
        answerIndex: 0,
        hint: 'What color do you get when you mix red and yellow?',
        explain: 'Red painted over yellow makes orange — so the yellow picture was hiding in plain sight!',
      },
    ]),
  },
  {
    id: 'boxcar-children',
    title: 'The Boxcar Children',
    author: 'Gertrude Chandler Warner',
    totalChapters: 13,
    totalPages: 154,
    band: 'Grades 2–4',
    tags: ['adventure', 'family'],
    cover: { background: '#b5533c', accent: '#f6e4c4', motif: 'boxcar' },
    moments: ['Finding the old boxcar', 'Making dishes from the dump', 'Swimming pool in the brook', 'Meeting Grandfather'],
    questions: qs('boxcar-children', [
      {
        type: 'detail',
        prompt: 'Where did Henry, Jessie, Violet and Benny make their home?',
        choices: ['In an old boxcar in the woods', 'In a castle', 'On a boat'],
        answerIndex: 0,
        hint: 'Look at the title of the book!',
        explain: 'In an old red boxcar in the woods.',
      },
      {
        type: 'feelings',
        prompt: 'Why did the children hide from their grandfather at first?',
        choices: ['They thought he would be mean', 'They were playing hide-and-seek', 'They didn’t know his name'],
        answerIndex: 0,
        hint: 'They had heard something about him that turned out not to be true…',
        explain: 'They thought he would be unkind — but he turned out to be loving and kind.',
      },
    ]),
  },
  {
    id: 'tom-kitten',
    title: 'The Tale of Tom Kitten',
    author: 'Beatrix Potter',
    band: 'Shared read-aloud; choose with a grown-up',
    tags: ['animals', 'classic'],
    cover: {
      background: '#9fb8a0',
      accent: '#fff4dc',
      motif: 'house',
    },
    moments: ['Getting ready for visitors', 'Climbing the garden wall', 'The ducks trying on clothes'],
    provenance: {
      sourceUrl: 'https://www.gutenberg.org/cache/epub/14837/pg14837-images.html',
      reviewedOn: '2026-10-17',
      edition: 'Original English story (1907); Project Gutenberg transcription',
      contentNote: 'Includes a parent smacking the kittens. Preview the story together; this app does not endorse that response.',
    },
    questions: [
      {
        id: 'tom-kitten.q1',
        type: 'detail',
        skillId: 'read.key-details',
        prompt: 'Who puts on Tom’s clothes after they fall off?',
        choices: ['Mr. Drake Puddle-Duck', 'Peter Rabbit', 'The visiting cats'],
        answerIndex: 0,
        hint: 'Think of the birds passing along the road.',
        explain: 'Mr. Drake puts the clothes on himself.',
      },
      {
        id: 'tom-kitten.q2',
        type: 'sequence',
        skillId: 'read.retell',
        prompt: 'Which happens before the kittens play in the garden?',
        choices: ['Their mother washes and dresses them', 'The ducks walk away wearing the clothes', 'Their mother finds them on the wall'],
        answerIndex: 0,
        hint: 'Think back to getting ready for visitors.',
        explain: 'The kittens are washed and dressed before going outside.',
      },
      {
        id: 'tom-kitten.q3',
        type: 'inference',
        skillId: 'read.inference',
        prompt: 'Why is climbing difficult for Tom in his fancy clothes?',
        choices: ['The clothes get in the way of moving', 'The wall is made of ice', 'He is carrying the ducks'],
        answerIndex: 0,
        hint: 'Think about Tom trying to jump in trousers.',
        explain: 'The story shows Tom struggling to move in his clothes and losing buttons.',
      },
      {
        id: 'tom-kitten.q4',
        type: 'detail',
        skillId: 'read.key-details',
        prompt: 'Where do the kittens climb to sit?',
        choices: ['On the garden wall', 'On a boat', 'In a cupboard'],
        answerIndex: 0,
        hint: 'They climb up the rockery to reach it.',
        explain: 'The kittens climb to the top of the garden wall.',
      },
    ],
  },
  {
    id: 'benjamin-bunny',
    title: 'The Tale of Benjamin Bunny',
    author: 'Beatrix Potter',
    band: 'Shared read-aloud; choose with a grown-up',
    tags: ['animals', 'classic'],
    cover: {
      background: '#9fb8a0',
      accent: '#fff4dc',
      motif: 'rabbit',
    },
    moments: ['Finding Peter’s clothes', 'Hiding under a basket', 'Returning home'],
    provenance: {
      sourceUrl: 'https://www.gutenberg.org/cache/epub/14407/pg14407-images.html',
      reviewedOn: '2026-10-17',
      edition: 'Original English story (1904); Project Gutenberg transcription',
      contentNote: 'Includes danger from a cat and an adult rabbit hitting the young rabbits. Preview the story together.',
    },
    questions: [
      {
        id: 'benjamin-bunny.q1',
        type: 'detail',
        skillId: 'read.key-details',
        prompt: 'Where do Benjamin and Peter find Peter’s coat and shoes?',
        choices: ['On a scarecrow', 'Inside a boat', 'In a bird’s nest'],
        answerIndex: 0,
        hint: 'Look in Mr. McGregor’s garden.',
        explain: 'Peter’s missing clothes are on the scarecrow.',
      },
      {
        id: 'benjamin-bunny.q2',
        type: 'sequence',
        skillId: 'read.retell',
        prompt: 'What do the rabbits do after taking Peter’s clothes from the scarecrow?',
        choices: ['Collect onions in the handkerchief', 'Build a new scarecrow', 'Go swimming in a pond'],
        answerIndex: 0,
        hint: 'Benjamin wants to bring a present for his aunt.',
        explain: 'After retrieving the clothes, they collect onions in the handkerchief.',
      },
      {
        id: 'benjamin-bunny.q3',
        type: 'inference',
        skillId: 'read.inference',
        prompt: 'Why can’t the rabbits simply leave their hiding place?',
        choices: ['A cat is sitting on top of the basket', 'The basket has sailed away', 'They are waiting for a picnic'],
        answerIndex: 0,
        hint: 'Think about what is above their heads.',
        explain: 'The cat on the basket makes it unsafe for the rabbits to come out.',
      },
      {
        id: 'benjamin-bunny.q4',
        type: 'detail',
        skillId: 'read.key-details',
        prompt: 'Who gets the cat away from the basket?',
        choices: ['Benjamin’s father', 'Mrs. McGregor', 'Cotton-tail'],
        answerIndex: 0,
        hint: 'A grown-up rabbit comes looking for his son.',
        explain: 'Benjamin’s father arrives and gets the cat off the basket.',
      },
    ],
  },
  {
    id: 'mrs-tiggy-winkle',
    title: 'The Tale of Mrs. Tiggy-Winkle',
    author: 'Beatrix Potter',
    band: 'Shared read-aloud; choose with a grown-up',
    tags: ['animals', 'classic'],
    cover: {
      background: '#9fb8a0',
      accent: '#fff4dc',
      motif: 'leaf',
    },
    moments: ['Looking for lost handkerchiefs', 'Watching the ironing', 'Returning clean clothes'],
    provenance: {
      sourceUrl: 'https://www.gutenberg.org/cache/epub/12103/pg12103-images.html',
      reviewedOn: '2026-10-17',
      edition: 'Original English story (1905); Project Gutenberg transcription',
      contentNote: 'The ending leaves room to wonder about Lucie’s experience; the questions do not grade whether it was a dream.',
    },
    questions: [
      {
        id: 'mrs-tiggy-winkle.q1',
        type: 'detail',
        skillId: 'read.key-details',
        prompt: 'What is Lucie looking for at the beginning?',
        choices: ['Her handkerchiefs and pinafore', 'A lost boat', 'A basket of apples'],
        answerIndex: 0,
        hint: 'She asks the animals about things she has lost.',
        explain: 'Lucie is looking for handkerchiefs and her pinafore.',
      },
      {
        id: 'mrs-tiggy-winkle.q2',
        type: 'sequence',
        skillId: 'read.retell',
        prompt: 'What happens after Lucie and Mrs. Tiggy-Winkle finish tea?',
        choices: ['They bundle the clothes to take back', 'Lucie first notices the hill', 'Lucie first loses her handkerchiefs'],
        answerIndex: 0,
        hint: 'Think about preparing to go down the hill.',
        explain: 'They tie up the clean clothes before taking them back.',
      },
      {
        id: 'mrs-tiggy-winkle.q3',
        type: 'inference',
        skillId: 'read.inference',
        prompt: 'What clue hints that Mrs. Tiggy-Winkle is a hedgehog?',
        choices: ['Prickles under her cap', 'Feathers on her wings', 'A long rabbit’s tail'],
        answerIndex: 0,
        hint: 'Lucie notices something unusual where hair would be.',
        explain: 'The prickles are a clue to her being a hedgehog.',
      },
      {
        id: 'mrs-tiggy-winkle.q4',
        type: 'detail',
        skillId: 'read.key-details',
        prompt: 'What work does Mrs. Tiggy-Winkle do for the animals?',
        choices: ['Washes and irons clothes', 'Repairs boats', 'Plants a forest'],
        answerIndex: 0,
        hint: 'Look at her basket and the iron she is using.',
        explain: 'She cleans and irons clothes for her animal neighbors.',
      },
    ],
  },
  {
    id: 'squirrel-nutkin',
    title: 'The Tale of Squirrel Nutkin',
    author: 'Beatrix Potter',
    band: 'Shared read-aloud; choose with a grown-up',
    tags: ['animals', 'classic'],
    cover: {
      background: '#9fb8a0',
      accent: '#fff4dc',
      motif: 'leaf',
    },
    moments: ['Crossing the lake on rafts', 'Gathering nuts', 'Nutkin making up games'],
    provenance: {
      sourceUrl: 'https://www.gutenberg.org/cache/epub/14872/pg14872-images.html',
      reviewedOn: '2026-10-17',
      edition: 'Original English story (1903); Project Gutenberg transcription',
      contentNote: 'Includes an owl threatening Nutkin and Nutkin losing part of his tail. Preview the story together.',
    },
    questions: [
      {
        id: 'squirrel-nutkin.q1',
        type: 'detail',
        skillId: 'read.key-details',
        prompt: 'How do the squirrels cross the lake?',
        choices: ['On little twig rafts', 'On a train', 'Through a tunnel'],
        answerIndex: 0,
        hint: 'Their tails help catch the wind.',
        explain: 'The squirrels paddle rafts made from twigs.',
      },
      {
        id: 'squirrel-nutkin.q2',
        type: 'sequence',
        skillId: 'read.retell',
        prompt: 'What do the other squirrels do before gathering nuts on the island?',
        choices: ['Bring Old Brown a gift and ask permission', 'Plant new trees', 'Build a house for Nutkin'],
        answerIndex: 0,
        hint: 'Think about how they greet the owl.',
        explain: 'They bring a gift and ask permission before collecting nuts.',
      },
      {
        id: 'squirrel-nutkin.q3',
        type: 'inference',
        skillId: 'read.inference',
        prompt: 'What suggests Old Brown does not enjoy Nutkin’s teasing?',
        choices: ['He shuts the door and later looks disgusted', 'He asks for more riddles', 'He dances with Nutkin'],
        answerIndex: 0,
        hint: 'Notice how the owl responds instead of joining in.',
        explain: 'Closing the door and looking disgusted are clues that the teasing bothers him.',
      },
      {
        id: 'squirrel-nutkin.q4',
        type: 'detail',
        skillId: 'read.key-details',
        prompt: 'What kind of animal is Old Brown?',
        choices: ['An owl', 'A frog', 'A hedgehog'],
        answerIndex: 0,
        hint: 'He lives in a hollow oak tree.',
        explain: 'Old Brown is the owl who lives on the island.',
      },
    ],
  },
  {
    id: 'jemima-puddle-duck',
    title: 'The Tale of Jemima Puddle-Duck',
    author: 'Beatrix Potter',
    band: 'Shared read-aloud; choose with a grown-up',
    tags: ['animals', 'classic'],
    cover: {
      background: '#9fb8a0',
      accent: '#fff4dc',
      motif: 'house',
    },
    moments: ['Looking for a nesting place', 'Making a nest in the shed', 'Talking with Kep'],
    provenance: {
      sourceUrl: 'https://www.gutenberg.org/cache/epub/14814/pg14814-images.html',
      reviewedOn: '2026-10-17',
      edition: 'Original English story (1908); Project Gutenberg transcription',
      contentNote: 'Includes a fox planning to eat Jemima and dogs eating her eggs. Preview the story together.',
    },
    questions: [
      {
        id: 'jemima-puddle-duck.q1',
        type: 'detail',
        skillId: 'read.key-details',
        prompt: 'What is Jemima trying to find away from the farm?',
        choices: ['A place to make her nest', 'A new pair of shoes', 'A school for rabbits'],
        answerIndex: 0,
        hint: 'She wants to hatch her own eggs.',
        explain: 'Jemima looks for a nesting place away from the farm.',
      },
      {
        id: 'jemima-puddle-duck.q2',
        type: 'sequence',
        skillId: 'read.retell',
        prompt: 'What happens after Jemima gathers herbs and onions?',
        choices: ['She tells Kep about the gentleman and the nest', 'She first leaves the farm to look for a nest', 'She first sees the gentleman reading'],
        answerIndex: 0,
        hint: 'A collie asks about the things she is carrying.',
        explain: 'After gathering the herbs and onions, Jemima tells Kep what has happened.',
      },
      {
        id: 'jemima-puddle-duck.q3',
        type: 'inference',
        skillId: 'read.inference',
        prompt: 'Why is the gentleman’s request for herbs and onions a warning clue?',
        choices: ['They are used to prepare roast duck', 'They will make the shed fly', 'They are toys for ducklings'],
        answerIndex: 0,
        hint: 'Think about why a fox might want cooking ingredients.',
        explain: 'The cooking ingredients suggest the fox has a dangerous plan for Jemima.',
      },
      {
        id: 'jemima-puddle-duck.q4',
        type: 'detail',
        skillId: 'read.key-details',
        prompt: 'Who asks Jemima questions about the house and shed?',
        choices: ['Kep the collie', 'Tom Kitten', 'Mrs. Tiggy-Winkle'],
        answerIndex: 0,
        hint: 'Think of the dog she meets at the farm.',
        explain: 'Kep listens and asks where the house and shed are.',
      },
    ],
  },
];

const catalogIndex = new Map(BOOK_CATALOG.map((b) => [b.id, b]));

export function getCatalogBook(id: string | undefined): CatalogBook | undefined {
  return id ? catalogIndex.get(id) : undefined;
}

/** Generic, honest prompts for books without a question bank. */
export const GENERIC_FEELINGS = ['Funny', 'Exciting', 'Cozy', 'Surprising', 'A little sad', 'Mysterious'] as const;

export type ConversationDepth = 'adaptive' | 'gentler' | 'deeper';

export interface StoryQuestionSelection {
  depth: ConversationDepth;
  mastery?: readonly MasteryRecord[];
  /** Most recently answered first; from explicit saved question IDs only. */
  recentQuestionIds?: readonly string[];
}

/**
 * Fresh questions first, then least-recently answered. Within equal freshness,
 * use the parent's depth and practice/review needs. No randomness or age labels.
 * The boolean form preserves older callers while they adopt richer context.
 */
export function selectQuestions(book: CatalogBook, selection: boolean | StoryQuestionSelection, max = 2): ComprehensionQuestion[] {
  const options = typeof selection === 'boolean' ? { depth: selection ? ('deeper' as const) : ('gentler' as const) } : selection;
  const mastery = new Map((options.mastery ?? []).map((m) => [m.skillId, m]));
  const deeper =
    options.depth === 'deeper' || (options.depth === 'adaptive' && masteryRank(effectiveLevel(mastery.get('read.key-details'))) >= masteryRank('proficient'));
  const recent = options.recentQuestionIds ?? [];
  const freshness = (q: ComprehensionQuestion) => {
    const index = recent.indexOf(q.id);
    return index < 0 ? -1 : recent.length - index;
  };
  const depth = (q: ComprehensionQuestion) => (['inference', 'feelings', 'theme', 'vocab'].includes(q.type) === deeper ? 0 : 1);
  const practice = (q: ComprehensionQuestion) => {
    const m = mastery.get(q.skillId);
    if (m?.needsReview) return 0;
    const level = effectiveLevel(m);
    if (level === 'introduced' || level === 'developing') return 1;
    return level === 'not_started' ? 2 : 3;
  };
  return [...book.questions]
    .sort((a, b) => freshness(a) - freshness(b) || depth(a) - depth(b) || practice(a) - practice(b))
    .slice(0, Math.max(0, Math.floor(max)));
}
