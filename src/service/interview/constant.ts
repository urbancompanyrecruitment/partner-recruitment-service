import { SlotRowOutcome, type InterviewCentre } from './interface.js';

export const DEFAULT_SLOT_TIME_ZONE = 'Asia/Singapore';

export const SLOT_WINDOW_DAYS = 2;

export const SLOT_ID_SEPARATOR = '_';

export const SLOT_TIME_FORMAT = 'HH:mm';

export const SLOT_DATE_FORMAT = 'YYYY-MM-DD';

export const ALL_COUNTRIES = 'Others';

export const INTERVIEW_CENTRES: InterviewCentre[] = [
  {
    key: 'singapore',
    name: 'Singapore Interview Centre',
    country: 'Singapore',
    cityName: 'Singapore',
    address: '33 Maude Road #02-01, Singapore 208344',
    timeZone: 'Asia/Singapore',
  },
  {
    key: 'yangon',
    name: 'Yangon Interview Centre',
    country: 'Myanmar',
    cityName: 'Yangon',
    address: 'Ye Tagon Tower (Pang Hlaing Tower), Pann Hlaing St, Yangon, Myanmar',
    timeZone: 'Asia/Yangon',
  },
];

export const SLOT_INSTRUCTIONS =
  'Arrive 15 minutes early with your passport or work permit. Wear comfortable clothes for the practical test.';

export const SLOT_UPLOAD_TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export const SLOT_CAPACITY_PATTERN = /^\d{1,4}$/;

export const MAX_SLOT_CAPACITY = 200;

export const MAX_SLOT_IMPORT_ROWS = 200;

export const SLOT_FILE_NAME_MAX_LENGTH = 255;

export const SLOT_UPLOAD_VALUE_MAX_LENGTH = 64;

export const SAVED_SLOT_OUTCOMES: SlotRowOutcome[] = [SlotRowOutcome.Created, SlotRowOutcome.Updated];
