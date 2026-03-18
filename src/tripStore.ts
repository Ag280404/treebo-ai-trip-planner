import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

export interface SavedTrip {
  id: string;
  sessionId: string;
  destination: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  tripType: string;
  budget: number;
  vibe: string[];
  plan: object;
  createdAt: Date;
}

// Get or create an anonymous session ID persisted in localStorage
export function getSessionId(): string {
  const key = 'treebo_session_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export async function saveTrip(
  details: {
    destination: string;
    checkIn: string;
    checkOut: string;
    guests: number;
    tripType: string;
    budget: number;
    vibe: string[];
  },
  plan: object
): Promise<string> {
  const docRef = await addDoc(collection(db, 'trips'), {
    sessionId: getSessionId(),
    ...details,
    plan,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function loadTrips(): Promise<SavedTrip[]> {
  const sessionId = getSessionId();
  const q = query(
    collection(db, 'trips'),
    where('sessionId', '==', sessionId),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      sessionId: data.sessionId,
      destination: data.destination,
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      guests: data.guests,
      tripType: data.tripType,
      budget: data.budget,
      vibe: data.vibe || [],
      plan: data.plan,
      createdAt: (data.createdAt as Timestamp)?.toDate?.() ?? new Date(),
    };
  });
}
