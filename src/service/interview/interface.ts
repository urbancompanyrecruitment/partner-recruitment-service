import type { z } from 'zod';
import type { slotImportSchema } from './schema.js';

export interface InterviewCity {
  key: string;
  name: string;
  country: string;
  centre: string;
  address: string;
  instructions: string;
  timeZone: string;
}

export interface InterviewSlot {
  id: string;
  definitionId?: string;
  cityKey: string;
  date: string;
  time: string;
  startsAt: string;
  timeZone: string;
  capacity: number;
}

export interface BookableSlot extends InterviewSlot {
  seatsLeft: number;
}

export interface SlotDaySummary {
  date: string;
  cityKey: string;
  slots: number;
  booked: number;
  capacity: number;
}

export interface SlotDefinitionRow {
  id: string;
  country: string;
  city_key: string;
  city_name: string;
  centre: string;
  address: string;
  instructions: string;
  time_zone: string;
  start_time: string;
  end_time: string;
  capacity: number;
  is_active: boolean;
}

export interface BookingCountRow {
  city_key: string;
  starts_at: string;
  total: number;
}

export interface BookingRow {
  id: string;
  partner_id: string;
  slot_id: string | null;
  city_key: string;
  starts_at: string;
  time_zone: string | null;
  capacity: number | null;
}

export interface NewBooking {
  id: string;
  partnerId: string;
  slotId?: string;
  cityKey: string;
  startsAt: string;
}

export interface InterviewCentre {
  key: string;
  name: string;
  country: string;
  cityName: string;
  address: string;
  timeZone: string;
}

export enum SlotRowOutcome {
  Created = 'created',
  Updated = 'updated',
  UnknownCentre = 'unknown_centre',
  InvalidTime = 'invalid_time',
  InvalidEndTime = 'invalid_end_time',
  InvalidCapacity = 'invalid_capacity',
  DuplicateInFile = 'duplicate_in_file',
}

export type SlotImportInput = z.infer<typeof slotImportSchema>;

export interface SlotEntry {
  centreRaw: string;
  startTimeRaw: string;
  endTimeRaw: string;
  capacityRaw: string;
  centre?: InterviewCentre;
  startTime?: string;
  endTime?: string;
  capacity?: number;
}

export interface ValidSlotEntry {
  centre: InterviewCentre;
  startTime: string;
  endTime: string;
  capacity: number;
}

export interface SlotRowView {
  rowNumber: number;
  centre: string;
  startTime: string;
  endTime: string;
  capacity: string;
  outcome: SlotRowOutcome;
}

export interface SlotImportResult {
  fileName: string;
  counts: { rows: number; created: number; updated: number; errors: number };
  rows: SlotRowView[];
}

export interface NewSlotDefinition {
  id: string;
  centre: InterviewCentre;
  instructions: string;
  startTime: string;
  endTime: string;
  capacity: number;
}
