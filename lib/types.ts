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
  kind: string;
  question: string;
  choices: string[];
  responses: { user: string; answer: string | null; guess: string | null }[];
  complete: boolean;
  correctAnswer: string | null;
};
