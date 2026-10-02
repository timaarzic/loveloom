/**
 * Provider-neutral contracts reserved for beta 0.7.
 *
 * This module deliberately contains no SDK imports and no client secrets. A
 * call provider and a synchronized player can be introduced behind these
 * contracts without coupling beta 0.6 chat or room state to a vendor.
 */
export const COLLABORATION_FEATURES = {
  calls: false,
  watchTogether: false,
} as const;

export type CollaborationRoom = {
  roomId: string;
  userId: string;
  epoch: number;
};

export type CallMode = "audio" | "video";

export type CallSession = {
  provider: "livekit";
  roomName: string;
  participantId: string;
  token: string;
  websocketUrl: string;
  expiresAt: number;
};

export interface CallSessionIssuer {
  issue(room: CollaborationRoom, mode: CallMode): Promise<CallSession>;
}

export type WatchCommand =
  | { kind: "load"; videoId: string; positionSeconds: number; revision: number }
  | { kind: "play"; positionSeconds: number; revision: number }
  | { kind: "pause"; positionSeconds: number; revision: number }
  | { kind: "seek"; positionSeconds: number; revision: number };

export type WatchSnapshot = {
  videoId: string | null;
  playing: boolean;
  positionSeconds: number;
  revision: number;
  changedBy: string;
  changedAt: number;
};

export interface WatchRoomSync {
  read(room: CollaborationRoom): Promise<WatchSnapshot>;
  publish(room: CollaborationRoom, command: WatchCommand): Promise<WatchSnapshot>;
  close(): void;
}
