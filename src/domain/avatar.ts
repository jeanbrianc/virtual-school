import type { Accessory, AvatarConfig, HairStyle, OutfitStyle } from './types';

export const SKIN_TONES = ['#f9d7c3', '#f1c1a1', '#e0a47c', '#c98a5e', '#a86b45', '#7d4a2c', '#5a3420'] as const;
export const HAIR_COLORS = ['#2b1d16', '#4a2e1f', '#7a4a26', '#a8672f', '#d19a4f', '#e8c77e', '#b5462f', '#1f1f2e'] as const;
export const EYE_COLORS = ['#3b2a1f', '#5b4030', '#3f6b8c', '#4d7a4f', '#6b5c43'] as const;
export const OUTFIT_COLORS = ['#e07a5f', '#3d85c6', '#81b29a', '#f2cc8f', '#9b5de5', '#f15bb5', '#2a9d8f', '#e9c46a', '#264653'] as const;
export const HAIR_STYLES: { id: HairStyle; label: string }[] = [
  { id: 'pigtails', label: 'Pigtails' },
  { id: 'bob', label: 'Bob' },
  { id: 'ponytail', label: 'Ponytail' },
  { id: 'curls', label: 'Curls' },
  { id: 'long', label: 'Long' },
  { id: 'buns', label: 'Space buns' },
  { id: 'short', label: 'Short' },
];
export const OUTFITS: { id: OutfitStyle; label: string }[] = [
  { id: 'overalls', label: 'Overalls' },
  { id: 'dress', label: 'Dress' },
  { id: 'tee', label: 'T-shirt & shorts' },
  { id: 'sweater', label: 'Cozy sweater' },
  { id: 'labcoat', label: 'Lab coat' },
];
export const ACCESSORIES: { id: Accessory; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'bow', label: 'Hair bow' },
  { id: 'glasses', label: 'Glasses' },
  { id: 'flowerCrown', label: 'Flower crown' },
  { id: 'headband', label: 'Headband' },
  { id: 'backpack', label: 'Backpack' },
  { id: 'starClips', label: 'Star clips' },
];

export const DEFAULT_AVATAR: AvatarConfig = {
  skinTone: '#f1c1a1',
  hairStyle: 'pigtails',
  hairColor: '#7a4a26',
  eyeColor: '#3b2a1f',
  outfit: 'overalls',
  outfitColor: '#3d85c6',
  accentColor: '#f2cc8f',
  accessory: 'bow',
  shoeColor: '#e07a5f',
};

export const GEORGIA_AVATAR: AvatarConfig = {
  skinTone: '#f1c1a1',
  hairStyle: 'curls',
  hairColor: '#a8672f',
  eyeColor: '#3f6b8c',
  outfit: 'dress',
  outfitColor: '#f15bb5',
  accentColor: '#f2cc8f',
  accessory: 'flowerCrown',
  shoeColor: '#9b5de5',
};
