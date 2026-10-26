import { getTodos } from '../api';
import type { PersonWithView } from '../types';

// Who's who (your id, the other admins, today in India): the to-do list answers it, once a visit.
let once: Promise<{ me: string; today: string; people: PersonWithView[] }> | null = null;

export const loadPeople = (): Promise<{ me: string; today: string; people: PersonWithView[] }> => {
  once ??= getTodos().then(({ me, today, people }) => ({ me, today, people }), (error: unknown) => { once = null; throw error; });
  return once;
};
