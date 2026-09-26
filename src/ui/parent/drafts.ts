import { createStore } from '../../state/store';

/** Hands a narrative typed on "Today" to the Log page. */
export const logDraftStore = createStore<{ text: string; autoInterpret: boolean }>({ text: '', autoInterpret: false });

export const SAMPLE_NARRATIVES = [
  'Izzy read two chapters of Charlotte’s Web this morning. She summarized what happened without help and correctly explained why Wilbur was scared. Later we baked bread and she measured 2 cups of flour and 1 tablespoon of yeast.',
  'Izzy and I baked muffins. She counted 12 cups, measured the flour herself, read several steps of the recipe, and asked why the muffins get bigger in the oven.',
  'We planted bean seeds in cups and put one in the dark closet to compare. Izzy predicted the one in the dark would not grow and watered them herself.',
  'Nature walk at the pond for about 45 minutes. She collected three acorns, a feather and a pinecone, watched a heron, and sorted her finds by color when we got home.',
  'Izzy painted a rainbow with watercolors and mixed red and yellow to make orange all by herself. She told me a story about the rainbow fish living under it.',
];
