import type { InterviewCity } from './interface.js';

export const SLOT_TIME_ZONE = 'Asia/Singapore';

export const SLOT_WINDOW_DAYS = 2;

export const SLOT_START_HOUR = 8;

export const SLOT_END_HOUR = 18;

export const SLOT_ID_SEPARATOR = '_';

export const SLOT_TIME_FORMAT = 'HH:mm';

export const SLOT_DATE_FORMAT = 'YYYY-MM-DD';

const DEFAULT_INSTRUCTIONS =
  'Arrive 15 minutes early with your passport or work permit. Wear comfortable clothes for the practical test.';

export const INTERVIEW_CITIES: InterviewCity[] = [
  {
    key: 'tampines',
    name: 'Tampines',
    centre: 'UC Tampines Centre',
    address: 'Tampines Central (placeholder — business to confirm)',
    instructions: DEFAULT_INSTRUCTIONS,
  },
  {
    key: 'jurong-east',
    name: 'Jurong East',
    centre: 'UC Jurong East Centre',
    address: 'Jurong Gateway Road (placeholder — business to confirm)',
    instructions: DEFAULT_INSTRUCTIONS,
  },
  {
    key: 'woodlands',
    name: 'Woodlands',
    centre: 'UC Woodlands Centre',
    address: 'Woodlands Square (placeholder — business to confirm)',
    instructions: DEFAULT_INSTRUCTIONS,
  },
  {
    key: 'bedok',
    name: 'Bedok',
    centre: 'UC Bedok Centre',
    address: 'New Upper Changi Road (placeholder — business to confirm)',
    instructions: DEFAULT_INSTRUCTIONS,
  },
  {
    key: 'ang-mo-kio',
    name: 'Ang Mo Kio',
    centre: 'UC Ang Mo Kio Centre',
    address: 'Ang Mo Kio Avenue 3 (placeholder — business to confirm)',
    instructions: DEFAULT_INSTRUCTIONS,
  },
];
