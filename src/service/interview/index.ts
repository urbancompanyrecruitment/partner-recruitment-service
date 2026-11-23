import { randomUUID } from 'node:crypto';
import { pool, type DbConnection, type Queryable } from '../../common/db/index.js';
import { AppError, ErrorCode } from '../../common/errors/index.js';
import { dayjs, WALL_CLOCK_FORMAT, type Dayjs } from '../../common/time.js';
import {
  ALL_COUNTRIES,
  DEFAULT_SLOT_TIME_ZONE,
  SLOT_DATE_FORMAT,
  SLOT_ID_SEPARATOR,
  SLOT_TIME_FORMAT,
  SLOT_WINDOW_DAYS,
} from './constant.js';
import type { BookableSlot, InterviewCity, InterviewSlot, SlotDaySummary, SlotDefinitionRow } from './interface.js';
import {
  countBookingsForSlot,
  findBookingByPartner,
  listActiveSlotDefinitions,
  listBookingCounts,
  upsertBooking,
} from './repository.js';

const toCity = (definition: SlotDefinitionRow): InterviewCity => ({
  key: definition.city_key,
  name: definition.city_name,
  country: definition.country,
  centre: definition.centre,
  address: definition.address,
  instructions: definition.instructions,
  timeZone: definition.time_zone,
});

export const citiesOf = (definitions: SlotDefinitionRow[], country?: string): InterviewCity[] =>
  definitions
    .filter((definition, index) => definitions.findIndex(item => item.city_key === definition.city_key) === index)
    .filter(definition => !country || country === ALL_COUNTRIES || definition.country === country)
    .map(toCity);

export const listCities = async (country?: string): Promise<InterviewCity[]> =>
  citiesOf(await listActiveSlotDefinitions(pool), country);

export const getCity = async (cityKey: string): Promise<InterviewCity | undefined> =>
  (await listCities()).find(city => city.key === cityKey);

export const slotIdOf = (cityKey: string, startsAt: string): string => {
  const start = dayjs(startsAt);

  return [cityKey, start.format(SLOT_DATE_FORMAT), start.format(SLOT_TIME_FORMAT)].join(SLOT_ID_SEPARATOR);
};

export const generateSlots = (definitions: SlotDefinitionRow[], now: Dayjs = dayjs()): InterviewSlot[] =>
  definitions
    .flatMap(definition =>
      Array.from({ length: SLOT_WINDOW_DAYS + 1 }, (_, dayOffset) =>
        now.tz(definition.time_zone).add(dayOffset, 'day').format(SLOT_DATE_FORMAT),
      )
        .map(date => dayjs.tz(`${date} ${definition.start_time}`, definition.time_zone))
        .filter(start => start.isAfter(now))
        .map(start => ({
          id: [definition.city_key, start.format(SLOT_DATE_FORMAT), start.format(SLOT_TIME_FORMAT)].join(SLOT_ID_SEPARATOR),
          definitionId: definition.id,
          cityKey: definition.city_key,
          date: start.format(SLOT_DATE_FORMAT),
          time: start.format(SLOT_TIME_FORMAT),
          startsAt: start.format(WALL_CLOCK_FORMAT),
          timeZone: definition.time_zone,
          capacity: definition.capacity,
        })),
    )
    .toSorted((a, b) => a.cityKey.localeCompare(b.cityKey) || a.startsAt.localeCompare(b.startsAt));

export const findOfferedSlot = async (slotId: string): Promise<InterviewSlot | undefined> =>
  generateSlots(await listActiveSlotDefinitions(pool)).find(slot => slot.id === slotId);

const slotKeyOf = (cityKey: string, startsAt: string): string => `${cityKey}|${startsAt}`;

const loadSlotsWithBookings = async (): Promise<BookableSlot[]> => {
  const slots = generateSlots(await listActiveSlotDefinitions(pool));
  const earliestDate = slots.map(slot => slot.date).toSorted()[0];
  const rows = earliestDate ? await listBookingCounts(pool, earliestDate) : [];
  const booked = new Map(rows.map(row => [slotKeyOf(row.city_key, row.starts_at), Number(row.total)]));

  return slots.map(slot => ({ ...slot, seatsLeft: slot.capacity - (booked.get(slotKeyOf(slot.cityKey, slot.startsAt)) ?? 0) }));
};

export const listBookableSlots = async (cityKey: string): Promise<BookableSlot[]> =>
  (await loadSlotsWithBookings()).filter(slot => slot.cityKey === cityKey && slot.seatsLeft > 0);

export const getSlotOccupancy = async (cityKey?: string): Promise<SlotDaySummary[]> => {
  const slots = (await loadSlotsWithBookings()).filter(slot => !cityKey || slot.cityKey === cityKey);
  const dayKeys = [...new Set(slots.map(slot => `${slot.date}|${slot.cityKey}`))];

  return dayKeys.map(dayKey => {
    const [date, city] = dayKey.split('|');
    const daySlots = slots.filter(slot => slot.date === date && slot.cityKey === city);

    return {
      date,
      cityKey: city,
      slots: daySlots.length,
      booked: daySlots.reduce((total, slot) => total + slot.capacity - slot.seatsLeft, 0),
      capacity: daySlots.reduce((total, slot) => total + slot.capacity, 0),
    };
  });
};

export const bookSlot = async (connection: DbConnection, partnerId: string, slot: InterviewSlot): Promise<void> => {
  const booked = await countBookingsForSlot(connection, slot.cityKey, slot.startsAt);

  if (booked >= slot.capacity) throw new AppError(ErrorCode.SlotUnavailable, { slotId: slot.id });

  await upsertBooking(connection, {
    id: randomUUID(),
    partnerId,
    slotId: slot.definitionId,
    cityKey: slot.cityKey,
    startsAt: slot.startsAt,
  });
};

export const findPartnerSlot = async (db: Queryable, partnerId: string): Promise<InterviewSlot | undefined> => {
  const booking = await findBookingByPartner(db, partnerId);

  if (!booking) return undefined;

  const start = dayjs(booking.starts_at);

  return {
    id: slotIdOf(booking.city_key, booking.starts_at),
    cityKey: booking.city_key,
    date: start.format(SLOT_DATE_FORMAT),
    time: start.format(SLOT_TIME_FORMAT),
    startsAt: start.format(WALL_CLOCK_FORMAT),
    timeZone: booking.time_zone ?? DEFAULT_SLOT_TIME_ZONE,
    capacity: booking.capacity ?? 0,
  };
};

export { ALL_COUNTRIES, INTERVIEW_CENTRES } from './constant.js';
export { SlotRowOutcome } from './interface.js';
export type {
  BookableSlot,
  InterviewCentre,
  InterviewCity,
  InterviewSlot,
  SlotDaySummary,
  SlotDefinitionRow,
  SlotImportResult,
} from './interface.js';
export { slotImportSchema } from './schema.js';
export { importSlots } from './slotImport.js';
export { listActiveSlotDefinitions } from './repository.js';
