export type Role = "founder" | "member";

export type SessionType =
  | "bible_study"
  | "prayer"
  | "communion"
  | "praise_worship"
  | "fellowship"
  | "custom";

export type RsvpStatus = "going" | "maybe" | "no";

export type Visibility = "public" | "private";

export interface Church {
  id: string;
  name: string;
  description: string;
  founderId: string;
  visibility: Visibility;
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
  /** Display names per RSVP, resolved server-side for cross-church lists */
  attendees?: { name: string; status: RsvpStatus }[];
}

export interface ChurchDetail extends Church {
  members: Member[];
  events: WorshipEvent[];
  /** null → viewing a public church as a non-member */
  myRole: Role | null;
  /** non-members: whether this viewer already asked to join */
  requestPending?: boolean;
  /** founder only: open join requests */
  requests?: { userId: string; displayName: string }[];
}

export interface DiscoverChurch extends Church {
  memberCount: number;
  mine: boolean;
}

export interface InviteInfo {
  token: string;
  churchId: string;
  churchName: string;
  invitedByName: string;
}
