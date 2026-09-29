import heroAvatar from "../assets/avatar/hero.png";
import avatar01 from "../assets/avatar/avatar-01.png";
import avatar02 from "../assets/avatar/avatar-02.png";
import avatar03 from "../assets/avatar/avatar-03.png";
import avatar04 from "../assets/avatar/avatar-04.png";
import avatar05 from "../assets/avatar/avatar-05.png";
import avatar06 from "../assets/avatar/avatar-06.png";
import avatar07 from "../assets/avatar/avatar-07.png";
import avatar08 from "../assets/avatar/avatar-08.png";
import avatar09 from "../assets/avatar/avatar-09.png";
import avatar10 from "../assets/avatar/avatar-10.png";
import avatar11 from "../assets/avatar/avatar-11.png";
import avatar12 from "../assets/avatar/avatar-12.png";
import avatar13 from "../assets/avatar/avatar-13.png";
import avatar14 from "../assets/avatar/avatar-14.png";
import avatar15 from "../assets/avatar/avatar-15.png";

// Default avatars are custom 3D character avatars saved in assets/avatar.
// Fallback avatars are Microsoft's Fluent 3D emoji (MIT) served from jsDelivr.
// A name always maps to the same avatar, so a seat looks the same in the lobby
// and at the table. You (Hero) have a dedicated poker avatar with sunglasses.

export const AVATAR_IMAGES = [
  avatar01,
  avatar02,
  avatar03,
  avatar04,
  avatar05,
  avatar06,
  avatar07,
  avatar08,
  avatar09,
  avatar10,
  avatar11,
  avatar12,
  avatar13,
  avatar14,
  avatar15,
];

// Fallback 3D emoji faces
export const EMOJI_FACES = [
  "Panda",
  "Skull",
  "Ghost",
  "Alien",
  "Robot",
  "Fox",
  "Cat face",
  "Dog face",
  "Frog",
  "Tiger face",
  "Monkey face",
  "Unicorn",
  "Koala",
  "Bear",
  "Penguin",
  "Owl",
  "Lion",
  "Hamster",
  "Pig face",
  "Alien monster",
  "Clown face",
  "Smiling face with sunglasses",
  "Cowboy hat face",
  "Nerd face",
  "Smiling face with horns",
  "Hatching chick",
];

export const faceUrl = (face: string) =>
  `https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/${encodeURIComponent(face)}/3D/${face.toLowerCase().replace(/ /g, "_")}_3d.png`;

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

// Hand-curated personas for default AI names
const NAME_TO_AVATAR: Record<string, string> = {
  Marcus: avatar10,
  Sarah: avatar14,
  David: avatar03,
  Elena: avatar02,
  James: avatar09,
  Jocelyn: avatar04,
  Luna: avatar06,
  Viktor: avatar15,
  Oliver: avatar05,
  Felix: avatar08,
};

export const avatarFor = (name: string): string => {
  if (name.toLowerCase() === "hero" || name === "You") return HERO_AVATAR;
  if (NAME_TO_AVATAR[name]) return NAME_TO_AVATAR[name];
  return AVATAR_IMAGES[hash(name) % AVATAR_IMAGES.length];
};

export const emojiAvatarFor = (name: string): string => {
  if (name.toLowerCase() === "hero" || name === "You") return HERO_EMOJI_AVATAR;
  return faceUrl(EMOJI_FACES[hash(name) % EMOJI_FACES.length]);
};

export const HERO_AVATAR = heroAvatar;
export const HERO_EMOJI_AVATAR = faceUrl("Eyes");

// Aliases for fallback
export const fallbackAvatarFor = emojiAvatarFor;
export const HERO_FALLBACK_AVATAR = HERO_EMOJI_AVATAR;
