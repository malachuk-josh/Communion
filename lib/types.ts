export type Role = "founder" | "member";

export type SessionType =
  | "bible_study"
  | "prayer"
  | "communion"
  | "praise_worship"
  | "fellowship"
  | "custom";

export type RsvpStatus = "going" | "maybe" | "no";

export interface Church {
  id: string;
  name: string;
  description: string;
  founderId: string;
  createdAt: number;
}

export interface Member {
  userId: string;
  role: Role;
  displayName: string;
}

export interface WorshipEvent {
  id: string;
  churchId: string;
  type: SessionType;
  title: string;
  startsAt: number;
  durationMin: number;
  passageRef?: string;
  meetingUrl?: string;
  /** Chosen gathering options, e.g. "Shared meal · Potluck — bring a dish" */
  details?: string;
  createdBy: string;
  createdAt: number;
  rsvps: Record<string, RsvpStatus>;
}

export interface ChurchDetail extends Church {
  members: Member[];
  events: WorshipEvent[];
  myRole: Role;
}

export interface InviteInfo {
  token: string;
  churchId: string;
  churchName: string;
  invitedByName: string;
}
