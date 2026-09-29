// Faces are Microsoft's Fluent 3D emoji (MIT), served from jsDelivr. A name
// always hashes to the same face, so a seat looks the same in the lobby and
// at the table. You are always the eyes.

const FACES = [
  "Panda", "Skull", "Ghost", "Alien", "Robot", "Fox", "Cat face", "Dog face",
  "Frog", "Tiger face", "Monkey face", "Unicorn", "Koala", "Bear", "Penguin",
  "Owl", "Lion", "Hamster", "Pig face", "Alien monster", "Clown face",
  "Smiling face with sunglasses", "Cowboy hat face", "Nerd face",
  "Smiling face with horns", "Hatching chick",
];

const faceUrl = (face: string) =>
  `https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/${encodeURIComponent(face)}/3D/${face.toLowerCase().replace(/ /g, "_")}_3d.png`;

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export const avatarFor = (name: string) => faceUrl(FACES[hash(name) % FACES.length]);

export const HERO_AVATAR = faceUrl("Eyes");
