import type { RowDataPacket } from 'mysql2/promise';

export interface InterviewCity {
  key: string;
  name: string;
  centre: string;
  address: string;
  instructions: string;
}

export interface InterviewSlot {
  id: string;
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

export interface BookingCountRow extends RowDataPacket {
  city_key: string;
  starts_at: string;
  total: number;
}

export interface BookingRow extends RowDataPacket {
  id: string;
  partner_id: string;
  city_key: string;
  starts_at: string;
}

export interface NewBooking {
  id: string;
  partnerId: string;
  cityKey: string;
  startsAt: string;
}
