import type { Vertical } from './site';

export interface NetworkAccount {
  id: number;
  email: string;
  name: string;
}

export interface NetworkTenant {
  id: number;
  slug: string;
  name: string;
  vertical: Vertical;
}

export interface SessionInfo {
  account: NetworkAccount;
  tenant: NetworkTenant;
  tenants: NetworkTenant[];
}

export interface RegisterInput {
  businessName: string;
  vertical: Vertical;
  email: string;
  name: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface TenantCreateInput {
  name: string;
  vertical: Vertical;
  slug?: string;
}

export interface SiteProfileInput {
  name: string;
  slug: string;
  tagline?: string | null;
  description?: string | null;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  workingHours?: string | null;
  brandColor: string;
  coverUrl?: string | null;
}

export interface SiteItemInput {
  name: string;
  description?: string | null;
  priceMinor?: number | null;
  durationMin?: number | null;
  capacity?: number | null;
  imageUrl?: string | null;
  isActive?: boolean;
  position?: number;
}

export interface SiteStatusInput {
  status: 'new' | 'contacted' | 'qualified' | 'disqualified';
}
