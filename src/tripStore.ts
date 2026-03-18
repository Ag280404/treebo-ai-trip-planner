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
  userId: string;
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

export async function saveTrip(
  userId: string,
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
    userId,
    ...details,
    plan,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function loadTrips(userId: string): Promise<SavedTrip[]> {
  const q = query(
    collection(db, 'trips'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: data.userId,
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
