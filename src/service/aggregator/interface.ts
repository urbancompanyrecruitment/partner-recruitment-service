import type { z } from 'zod';
import type { addAggregatorSchema } from './schema.js';

export type AddAggregatorInput = z.infer<typeof addAggregatorSchema>;

export interface AggregatorRow {
  id: string;
  recruiter_id: string;
  name: string;
  is_active: boolean;
  created_by_admin_id: string;
  created_at: string;
  updated_at: string;
}

export interface AggregatorView {
  id: string;
  recruiterId: string;
  name: string;
  createdAt: string;
}

export interface NewAggregator {
  id: string;
  recruiterId: string;
  name: string;
  adminId: string;
}
