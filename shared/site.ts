import type { LeadStatus } from './types';

export type Vertical = 'restaurant' | 'service' | 'tourism';
export type SiteItemKind = 'dish' | 'service' | 'room';

export const verticalLabels: Record<Vertical, string> = {
  restaurant: 'Ресторан',
  service: 'Сервисный бизнес',
  tourism: 'Туризм и размещение',
};

export const siteItemKindLabels: Record<SiteItemKind, string> = {
  dish: 'Блюдо',
  service: 'Услуга',
  room: 'Номер',
};

export interface SiteConfig {
  vertical: Vertical;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  workingHours: string | null;
  brandColor: string;
  coverUrl: string | null;
  isPublished: boolean;
  updatedAt: string;
}

export interface SiteItem {
  id: number;
  kind: SiteItemKind;
  name: string;
  description: string | null;
  priceMinor: number | null;
  durationMin: number | null;
  capacity: number | null;
  imageUrl: string | null;
  isActive: boolean;
  position: number;
}

export interface PublicSite extends SiteConfig {
  items: SiteItem[];
}

export interface SiteAdminData {
  site: SiteConfig;
  items: SiteItem[];
}

export interface SiteRequest {
  id: number;
  code: string;
  guestName: string;
  phone: string;
  email: string | null;
  requestedDate: string | null;
  requestedTime: string | null;
  checkOut: string | null;
  guests: number | null;
  itemId: number | null;
  itemName: string | null;
  comment: string | null;
  leadId: number;
  leadStatus: LeadStatus;
  createdAt: string;
}

export interface SiteRequestInput {
  guestName: string;
  phone: string;
  email?: string | null;
  requestedDate?: string | null;
  requestedTime?: string | null;
  checkOut?: string | null;
  guests?: number | null;
  itemId?: number | null;
  comment?: string | null;
}

export interface SiteRequestResult {
  code: string;
  message: string;
}
