export type User = { id: string; name: string; email: string };
export type Member = { id: string; name: string; seen: number };
export type Room = {
  id: string;
  owner: string;
  code: string;
  start: string;
  timezone: string;
  created: number;
  epoch: number;
  billing: "free";
  members: Member[];
  nickname: string;
};
export type EntryKind =
  "event" | "memory" | "note" | "wish" | "movie" | "music";
export type Entry = {
  id: string;
  room: string;
  author: string;
  kind: EntryKind;
  title: string;
  body: string;
  date: string;
  done: number;
  created: number;
  version: number;
};
export type Message = {
  seq: number;
  id: string;
  author: string;
  text: string;
  created: number;
  media?: MediaItem | null;
  reply?: MessageReply | null;
  reactions?: MessageReaction[];
};

export type MessageReply = {
  id: string;
  author: string;
  text: string;
  mediaKind: MediaKind | null;
};

export type MessageReaction = {
  emoji: MessageReactionEmoji;
  users: string[];
};

export const MESSAGE_REACTIONS = ["💗", "😘", "😂", "🥹", "🤗", "👍"] as const;
export type MessageReactionEmoji = (typeof MESSAGE_REACTIONS)[number];

export type MessagePage = {
  messages: Message[];
  hasMore: boolean;
  epoch: number;
  partnerReadSeq: number;
};

export type MediaKind = "image" | "video" | "audio";
export type MediaContext = "chat" | "album";
export type MediaItem = {
  id: string;
  room: string;
  author: string;
  kind: MediaKind;
  context: MediaContext;
  mime: string;
  bytes: number;
  caption: string;
  path: string;
  created: number;
  url?: string;
};

export type TimeCapsule = {
  id: string;
  author: string;
  title: string;
  body: string | null;
  opensAt: number;
  created: number;
  isOpen: boolean;
};

export type GardenState = {
  growth: number;
  stage: number;
  wateredToday: boolean;
  lastWateredBy: string | null;
  lastWateredAt: number | null;
};
export type Snapshot = {
  user: User | null;
  room: Room | null;
  entries: Entry[];
  distance: number | null;
  locationShared: boolean;
  locationUpdated: number | null;
  csrf: string;
};
export type Game = {
  id: string;
  kind: "know" | "quiz" | "either" | "date";
  question: string;
  choices: string[];
  responses: { user: string; answer: string | null; guess: string | null }[];
  complete: boolean;
  correctAnswer: string | null;
};
