export type Category = 'lighting' | 'seating' | 'accessibility' | 'litter' | 'noise' | 'other';

export type Status = 'open' | 'in_review' | 'scheduled' | 'sent_to_city' | 'fixed';

export interface IssueUpdate {
  id: string;
  author: string;
  role: 'partner' | 'resident';
  text: string;
  date: string;
}

export interface HistoryEvent {
  date: string;
  text: string;
}

export interface CityRequest {
  sr: string;
  agency: string;
  routedTo: string;
  sentOn: string;
  sentBy: string;
  lastFollowUp?: string;
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  category: Category;
  status: Status;
  lat: number;
  lng: number;
  locationLabel: string;
  locationDetail?: string;
  votes: number;
  votesThisWeek: number;
  createdAt: string;
  owner: string | null;
  /** City agency that owns the asset, when the District can't fix it directly. */
  agency?: string;
  photos: string[];
  cityRequest?: CityRequest;
  updates: IssueUpdate[];
  history: HistoryEvent[];
  via: string;
  following: number;
  duplicatesMerged: number;
  confirmedFixed: number;
  fixedOn?: string;
  isUserReport?: boolean;
}
