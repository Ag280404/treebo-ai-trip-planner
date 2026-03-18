/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  MapPin,
  Hotel,
  ClipboardList,
  MessageSquare,
  ChevronRight,
  ChevronDown,
  Star,
  CheckCircle2,
  Send,
  Plus,
  Minus,
  Calendar,
  Users,
  Briefcase,
  User,
  Sparkles,
  ArrowRight,
  Download,
  Share2,
  AlertCircle,
  Loader2,
  Map as MapIcon,
  X,
  Clock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { saveTrip, loadTrips, type SavedTrip } from './tripStore';
import { auth } from './firebase';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import {
  APIProvider,
  Map,
  AdvancedMarker,
} from '@vis.gl/react-google-maps';

// --- Types ---

type AppUser = {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  isGuest?: boolean;
};

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  Delhi: { lat: 28.6139, lng: 77.209 },
  Mumbai: { lat: 19.076, lng: 72.8777 },
  Bangalore: { lat: 12.9716, lng: 77.5946 },
  Goa: { lat: 15.2993, lng: 74.124 },
  Manali: { lat: 32.2432, lng: 77.1892 },
  Jaipur: { lat: 26.9124, lng: 75.7873 },
  Hyderabad: { lat: 17.385, lng: 78.4867 },
  Coorg: { lat: 12.3375, lng: 75.8069 },
};

interface HotelData {
  id: string;
  name: string;
  location: string;
  rating: number;
  price: number;
  amenities: string[];
  imageGradient: string;
  city: string;
}

interface Activity {
  name: string;
  emoji: string;
  description: string;
  duration_hours: number;
  cost_inr: number;
  distance_from_hotel_km: number;
}

interface DayPlan {
  day: number;
  label: string;
  morning: Activity[];
  afternoon: Activity[];
  evening: Activity[];
}

interface TripPlan {
  trip_summary: {
    destination: string;
    total_estimated_cost_inr: number;
    top_tip: string;
    vibe_tags: string[];
  };
  days: DayPlan[];
}

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

// --- Utilities ---
function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function renderMarkdown(raw: string): string {
  let text = raw.replace(/<[^>]*>/g, '');
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  const lines = text.split('\n');
  const out: string[] = [];
  let inOl = false;
  let inUl = false;
  for (const line of lines) {
    const olMatch = line.match(/^\d+\.\s+(.+)/);
    const ulMatch = line.match(/^[-*]\s+(.+)/);
    if (olMatch) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (!inOl) { out.push('<ol>'); inOl = true; }
      out.push(`<li>${olMatch[1]}</li>`);
    } else if (ulMatch) {
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push(`<li>${ulMatch[1]}</li>`);
    } else {
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (line.trim()) out.push(`<p>${line}</p>`);
    }
  }
  if (inOl) out.push('</ol>');
  if (inUl) out.push('</ul>');
  return out.join('');
}

// --- Demo Plan ---
const DEMO_PLAN: TripPlan = {
  trip_summary: {
    destination: 'Goa',
    total_estimated_cost_inr: 18500,
    top_tip: 'Visit beaches early morning for fewer crowds',
    vibe_tags: ['Relaxation', 'Food & Nightlife', 'Beach'],
  },
  days: [
    {
      day: 1,
      label: 'Day 1 — Saturday, 20 Dec',
      morning: [
        { name: 'Breakfast at Hotel', emoji: '🍳', description: 'Start with the free breakfast at Treebo', duration_hours: 1, cost_inr: 0, distance_from_hotel_km: 0 },
        { name: 'Calangute Beach Walk', emoji: '🏖️', description: "Stroll along Goa's most popular beach", duration_hours: 2, cost_inr: 0, distance_from_hotel_km: 0.8 },
      ],
      afternoon: [
        { name: 'Baga Beach Water Sports', emoji: '🏄', description: 'Try parasailing and jet skiing', duration_hours: 3, cost_inr: 1500, distance_from_hotel_km: 2.1 },
        { name: "Tito's Lane Lunch", emoji: '🍛', description: 'Fresh seafood thali at a shack', duration_hours: 1, cost_inr: 600, distance_from_hotel_km: 2.3 },
      ],
      evening: [
        { name: 'Sunset at Anjuna Cliff', emoji: '🌅', description: 'Perfect sunset view point', duration_hours: 1.5, cost_inr: 0, distance_from_hotel_km: 6 },
        { name: 'Night Market at Arpora', emoji: '🛍️', description: 'Saturday Night Bazaar for souvenirs', duration_hours: 2, cost_inr: 800, distance_from_hotel_km: 4.5 },
      ],
    },
    {
      day: 2,
      label: 'Day 2 — Sunday, 21 Dec',
      morning: [
        { name: 'Old Goa Churches Tour', emoji: '⛪', description: 'UNESCO heritage Basilica of Bom Jesus', duration_hours: 2.5, cost_inr: 0, distance_from_hotel_km: 18 },
        { name: 'Panjim City Walk', emoji: '🚶', description: 'Fontainhas Latin Quarter streets', duration_hours: 1.5, cost_inr: 0, distance_from_hotel_km: 16 },
      ],
      afternoon: [
        { name: 'Dudhsagar Falls Day Trip', emoji: '💦', description: 'Spectacular 4-tier waterfall', duration_hours: 4, cost_inr: 2000, distance_from_hotel_km: 60 },
      ],
      evening: [
        { name: 'Curlies Beach Shack', emoji: '🍹', description: "Cocktails at Goa's iconic beach bar", duration_hours: 2, cost_inr: 1200, distance_from_hotel_km: 7 },
      ],
    },
    {
      day: 3,
      label: 'Day 3 — Monday, 22 Dec',
      morning: [
        { name: 'Yoga at the Beach', emoji: '🧘', description: 'Morning class at Morjim beach', duration_hours: 1.5, cost_inr: 400, distance_from_hotel_km: 14 },
      ],
      afternoon: [
        { name: 'Spice Plantation Tour', emoji: '🌿', description: 'Guided tour with traditional lunch', duration_hours: 3, cost_inr: 1200, distance_from_hotel_km: 25 },
      ],
      evening: [
        { name: 'Farewell Sunset Cruise', emoji: '🚢', description: 'Mandovi river dolphin watching cruise', duration_hours: 2, cost_inr: 1500, distance_from_hotel_km: 17 },
      ],
    },
  ],
};

// --- Static Data ---
const CITIES = ['Delhi', 'Mumbai', 'Bangalore', 'Jaipur', 'Goa', 'Manali', 'Coorg', 'Hyderabad'];
const TRIP_TYPES = ['Solo', 'Couple', 'Family', 'Friends', 'Work'];
const VIBES = ['Adventure', 'Relaxation', 'Culture', 'Food & Nightlife', 'Nature', 'City Exploration'];

const MOCK_HOTELS: HotelData[] = [
  { id: 'g1', name: 'Treebo Trend Amber Heights', location: 'Near Calangute Beach, Goa', rating: 4.2, price: 2400, amenities: ['Free WiFi', 'AC', 'Breakfast', 'Swimming Pool'], imageGradient: 'from-blue-400 to-teal-500', city: 'Goa' },
  { id: 'g2', name: 'Treebo Trend Dona Julia', location: 'Candolim, Goa', rating: 3.8, price: 1800, amenities: ['Free WiFi', 'AC', 'Parking'], imageGradient: 'from-teal-400 to-emerald-500', city: 'Goa' },
  { id: 'g3', name: 'Treebo Trend Green Park', location: 'Mapusa, Goa', rating: 4.5, price: 3200, amenities: ['Free WiFi', 'AC', 'Breakfast', '24/7 Check-in'], imageGradient: 'from-emerald-400 to-green-500', city: 'Goa' },
  { id: 'g4', name: 'Treebo Trend Ocean View', location: 'Anjuna, Goa', rating: 4.0, price: 2100, amenities: ['Free WiFi', 'AC', 'Parking', 'Breakfast'], imageGradient: 'from-cyan-400 to-blue-500', city: 'Goa' },
  { id: 'g5', name: 'Treebo Trend Sea Breeze', location: 'Baga, Goa', rating: 3.6, price: 1500, amenities: ['Free WiFi', 'AC'], imageGradient: 'from-blue-500 to-indigo-500', city: 'Goa' },
  { id: 'g6', name: 'Treebo Trend Palm Grove', location: 'Vagator, Goa', rating: 4.1, price: 2800, amenities: ['Free WiFi', 'AC', 'Breakfast', 'Parking'], imageGradient: 'from-teal-500 to-cyan-600', city: 'Goa' },
  { id: 'd1', name: 'Treebo Trend Signature', location: 'Near Connaught Place, Delhi', rating: 4.3, price: 3500, amenities: ['Free WiFi', 'AC', 'Breakfast', 'Parking'], imageGradient: 'from-orange-400 to-red-500', city: 'Delhi' },
  { id: 'd2', name: 'Treebo Trend Metro Inn', location: 'Karol Bagh, Delhi', rating: 3.9, price: 2200, amenities: ['Free WiFi', 'AC', '24/7 Check-in'], imageGradient: 'from-red-400 to-pink-500', city: 'Delhi' },
  { id: 'b1', name: 'Treebo Trend Silicon Hearth', location: 'Koramangala, Bangalore', rating: 4.4, price: 2900, amenities: ['Free WiFi', 'AC', 'Breakfast', 'Parking'], imageGradient: 'from-purple-400 to-indigo-500', city: 'Bangalore' },
  { id: 'm1', name: 'Treebo Trend De Grandeur', location: 'Andheri East, Mumbai', rating: 4.1, price: 3800, amenities: ['Free WiFi', 'AC', 'Breakfast'], imageGradient: 'from-blue-600 to-cyan-700', city: 'Mumbai' },
  { id: 'm2', name: 'Treebo Trend Sea Side', location: 'Juhu, Mumbai', rating: 3.9, price: 4200, amenities: ['Free WiFi', 'AC', 'Parking'], imageGradient: 'from-cyan-600 to-blue-800', city: 'Mumbai' },
  { id: 'j1', name: 'Treebo Trend Royal Sun', location: 'Bani Park, Jaipur', rating: 4.3, price: 2100, amenities: ['Free WiFi', 'AC', 'Breakfast', 'Parking'], imageGradient: 'from-orange-500 to-amber-600', city: 'Jaipur' },
  { id: 'j2', name: 'Treebo Trend Pink City', location: 'Near Hawa Mahal, Jaipur', rating: 4.0, price: 1800, amenities: ['Free WiFi', 'AC', '24/7 Check-in'], imageGradient: 'from-pink-500 to-red-600', city: 'Jaipur' },
  { id: 'mn1', name: 'Treebo Trend Snow View', location: 'Old Manali, Manali', rating: 4.6, price: 2800, amenities: ['Free WiFi', 'Heater', 'Breakfast', 'Mountain View'], imageGradient: 'from-blue-100 to-blue-300', city: 'Manali' },
  { id: 'mn2', name: 'Treebo Trend River Side', location: 'Near Beas River, Manali', rating: 4.2, price: 2400, amenities: ['Free WiFi', 'Heater', 'Parking'], imageGradient: 'from-cyan-200 to-blue-400', city: 'Manali' },
  { id: 'c1', name: 'Treebo Trend Coffee Estate', location: 'Madikeri, Coorg', rating: 4.5, price: 3200, amenities: ['Free WiFi', 'Breakfast', 'Nature Walk'], imageGradient: 'from-green-600 to-emerald-800', city: 'Coorg' },
  { id: 'c2', name: 'Treebo Trend Misty Hills', location: 'Kushalnagar, Coorg', rating: 4.1, price: 2600, amenities: ['Free WiFi', 'AC', 'Parking'], imageGradient: 'from-emerald-500 to-green-700', city: 'Coorg' },
  { id: 'h1', name: 'Treebo Trend Pearl City', location: 'Banjara Hills, Hyderabad', rating: 4.3, price: 2900, amenities: ['Free WiFi', 'AC', 'Breakfast', 'Parking'], imageGradient: 'from-indigo-600 to-purple-700', city: 'Hyderabad' },
  { id: 'h2', name: 'Treebo Trend Cyber Inn', location: 'Hitech City, Hyderabad', rating: 4.0, price: 2500, amenities: ['Free WiFi', 'AC', '24/7 Check-in'], imageGradient: 'from-purple-500 to-indigo-600', city: 'Hyderabad' },
];

// --- Error Boundary ---

class TripErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { console.error('Trip tab error:', error); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
          <span className="text-4xl mb-4">🗺️</span>
          <h3 className="font-display font-bold text-lg text-treebo-text mb-2">Something went wrong</h3>
          <p className="text-sm text-treebo-muted mb-4">We couldn't load your trip. Please try again.</p>
          <button onClick={() => { this.setState({ hasError: false }); this.props.onReset(); }} className="bg-treebo-teal text-white px-4 py-2 rounded-xl text-sm font-medium">Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Components ---

const Header = ({ user, onSignOut, onShowHistory }: { user: AppUser | null; onSignOut: () => void; onShowHistory: () => void }) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-treebo-bg/95 backdrop-blur-sm border-b border-treebo-border px-5 py-2.5 flex justify-between items-center">
      <div className="flex items-center gap-2">
        <img src="/treebo-icon.svg" alt="Treebo" className="w-9 h-9" />
        <div className="flex items-baseline gap-1.5">
          <h1 className="text-[18px] font-display font-semibold text-treebo-teal tracking-tight leading-none">treebo</h1>
          <span className="text-[10px] text-treebo-muted font-sans font-light tracking-wide leading-none">ai planner</span>
        </div>
      </div>

      {user ? (
        <div className="relative">
          <button onClick={() => setMenuOpen((p) => !p)} className="flex items-center gap-2 focus:outline-none">
            <span className="text-[12px] text-treebo-muted font-medium">Hi, {user.displayName?.split(' ')[0] || 'there'}</span>
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || ''} className="w-8 h-8 rounded-full border-2 border-treebo-teal/30" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-treebo-teal text-white flex items-center justify-center text-[12px] font-semibold">
                {user.isGuest ? '👤' : user.displayName?.[0] || 'U'}
              </div>
            )}
          </button>

          <AnimatePresence>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-11 z-20 w-56 bg-white border border-treebo-border rounded-2xl shadow-lg overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-treebo-border bg-treebo-tag/50">
                    <p className="text-[13px] font-semibold text-treebo-text truncate">{user.isGuest ? 'Guest User' : user.displayName}</p>
                    <p className="text-[11px] text-treebo-muted truncate mt-0.5">{user.isGuest ? 'Browsing as guest' : user.email}</p>
                  </div>
                  {!user.isGuest && (
                    <button
                      onClick={() => { setMenuOpen(false); onShowHistory(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-[13px] font-medium text-treebo-text hover:bg-treebo-tag transition-colors border-b border-treebo-border"
                    >
                      <Clock size={14} className="text-treebo-teal" />
                      My Trip History
                    </button>
                  )}
                  <button
                    onClick={() => { setMenuOpen(false); onSignOut(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-[13px] font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <ArrowRight size={14} className="rotate-180 text-red-500" />
                    {user.isGuest ? 'Sign in with Google' : 'Sign out'}
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div className="w-8 h-8 rounded-full bg-treebo-tag border border-treebo-border flex items-center justify-center">
          <User size={14} className="text-treebo-muted" />
        </div>
      )}
    </header>
  );
};

const BottomNav = ({
  activeTab,
  setActiveTab,
  hasItinerary,
}: {
  activeTab: string;
  setActiveTab: (t: string) => void;
  hasItinerary: boolean;
}) => {
  // 4 tabs only — History moved to profile menu in header
  const tabs = [
    { id: 'plan', label: 'Plan', icon: MapPin },
    { id: 'hotels', label: 'Hotels', icon: Hotel },
    { id: 'itinerary', label: 'Trip', icon: ClipboardList },
    { id: 'chat', label: 'AI Chat', icon: MessageSquare },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-treebo-border flex items-stretch pb-[env(safe-area-inset-bottom,0px)]">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-all duration-200 relative ${isActive ? 'text-treebo-teal' : 'text-gray-400'}`}
          >
            {isActive && <span className="absolute top-0 left-[20%] right-[20%] h-[2.5px] rounded-full bg-treebo-teal" />}
            <div className="relative">
              <Icon size={22} strokeWidth={isActive ? 2.2 : 1.5} />
              {tab.id === 'itinerary' && hasItinerary && activeTab !== 'itinerary' && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400" />
              )}
            </div>
            <span className={`text-[10px] font-semibold leading-none tracking-wide ${isActive ? 'text-treebo-teal' : 'text-gray-400'}`}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

const Chip = ({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all duration-150 border ${
      selected ? 'bg-treebo-teal text-white border-treebo-teal shadow-sm' : 'bg-white text-treebo-muted border-treebo-border hover:border-treebo-teal/50 hover:text-treebo-teal'
    }`}
  >
    {label}
  </button>
);

const HotelCard = ({
  hotel,
  isRecommended,
  isSelected,
  onSelect,
  onViewDetails,
}: {
  hotel: HotelData;
  isRecommended: boolean;
  isSelected: boolean;
  onSelect: (h: HotelData) => void;
  onViewDetails: (h: HotelData) => void;
}) => (
  <motion.div
    whileHover={{ y: -2 }}
    transition={{ duration: 0.15 }}
    className={`bg-white rounded-2xl overflow-hidden border shadow-card relative group ${isSelected ? 'border-treebo-teal ring-2 ring-treebo-teal/20' : 'border-treebo-border'}`}
  >
    {isRecommended && (
      <div className="absolute top-3 right-3 z-10 bg-treebo-teal text-white text-[10px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
        <Sparkles size={9} /> AI Pick
      </div>
    )}
    <div className={`h-40 bg-gradient-to-br ${hotel.imageGradient} relative overflow-hidden`}>
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
      <Hotel size={44} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/20" />
      <div className="absolute bottom-2.5 left-3 z-10 flex items-center gap-1 bg-black/25 text-white text-[10px] font-medium px-2 py-1 rounded border border-white/20">
        <CheckCircle2 size={9} /> Treebo Assured
      </div>
    </div>

    <div className="p-4">
      <div className="flex justify-between items-start mb-1">
        <h3 className="font-display font-semibold text-[15px] text-treebo-text leading-snug pr-2">{hotel.name}</h3>
        <div className="flex items-center gap-0.5 bg-treebo-teal text-white px-1.5 py-0.5 rounded text-[11px] font-semibold flex-shrink-0">
          <Star size={10} fill="white" /> {hotel.rating}
        </div>
      </div>
      <div className="flex items-center gap-1 text-treebo-muted text-[12px] mb-3">
        <MapPin size={10} /> {hotel.location}
      </div>
      <div className="flex flex-wrap gap-1 mb-4">
        {hotel.amenities.slice(0, 3).map((a, i) => (
          <span key={i} className="bg-treebo-tag text-treebo-muted text-[11px] px-2 py-0.5 rounded border border-treebo-border">{a}</span>
        ))}
      </div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-[22px] font-display font-semibold text-treebo-teal leading-none">₹{hotel.price}</span>
          <span className="text-[11px] text-treebo-muted ml-1">/ night</span>
        </div>
        <button
          onClick={() => onSelect(hotel)}
          className={`font-semibold text-[12px] px-4 py-2 rounded-lg transition-all active:scale-95 ${
            isSelected ? 'bg-treebo-teal-light text-treebo-teal border border-treebo-teal/30' : 'bg-treebo-amber text-white hover:bg-amber-500 shadow-button-amber'
          }`}
        >
          {isSelected ? '✓ Selected' : 'Book Now'}
        </button>
      </div>
      <button
        onClick={() => onViewDetails(hotel)}
        className="w-full text-center text-[12px] text-treebo-muted hover:text-treebo-teal transition-colors underline underline-offset-2"
      >
        View Details
      </button>
    </div>
  </motion.div>
);

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState('plan');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [tripDetails, setTripDetails] = useState({
    destination: 'Goa',
    checkIn: '',
    checkOut: '',
    guests: 2,
    tripType: 'Couple',
    budget: 2500,
    vibe: [] as string[],
  });

  const [generatedPlan, setGeneratedPlan] = useState<TripPlan | null>(null);
  const [selectedHotel, setSelectedHotel] = useState<HotelData | null>(null);
  const [viewingHotel, setViewingHotel] = useState<HotelData | null>(null);
  const [openDay, setOpenDay] = useState<number>(0);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('Crafting your trip...');
  const [showMapModal, setShowMapModal] = useState(false);

  const isDemoMode = new URLSearchParams(window.location.search).get('demo') === 'true';
  const chatEndRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => setToast(msg);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isTyping]);

  // Demo mode: auto-populate
  useEffect(() => {
    if (!isDemoMode) return;
    setUser({ uid: 'demo', displayName: 'Treebo Reviewer', email: 'reviewer@treebo.com', photoURL: null, isGuest: true });
    setTripDetails({ destination: 'Goa', checkIn: '2025-12-20', checkOut: '2025-12-23', guests: 2, tripType: 'Couple', budget: 2500, vibe: ['Relaxation', 'Food & Nightlife'] });
    setSelectedHotel(MOCK_HOTELS.find((h) => h.id === 'g1') || null);
    setGeneratedPlan(DEMO_PLAN);
    setActiveTab('itinerary');
    setAuthLoading(false);
  }, []);

  // Firebase auth
  useEffect(() => {
    if (isDemoMode) return;
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setUser(fbUser as AppUser | null);
      setAuthLoading(false);
      if (fbUser) {
        setTripsLoading(true);
        loadTrips(fbUser.uid)
          .then((trips) => {
            setSavedTrips(trips);
            if (trips.length > 0 && !generatedPlan) {
              const latest = trips[0];
              setGeneratedPlan(latest.plan as TripPlan);
              setTripDetails({ destination: latest.destination, checkIn: latest.checkIn, checkOut: latest.checkOut, guests: latest.guests, tripType: latest.tripType, budget: latest.budget, vibe: latest.vibe });
            }
          })
          .catch(console.error)
          .finally(() => setTripsLoading(false));
      } else {
        setSavedTrips([]);
        setTripsLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const filteredHotels = useMemo(() => {
    const h = MOCK_HOTELS.filter((h) => h.city === tripDetails.destination);
    return h.length > 0 ? h : MOCK_HOTELS.filter((h) => h.city === 'Goa');
  }, [tripDetails.destination]);

  const generateTripPlan = async () => {
    if (!tripDetails.checkIn || !tripDetails.checkOut) { setError('Please select your check-in and check-out dates.'); return; }
    if (tripDetails.checkOut <= tripDetails.checkIn) { setError('Check-out date must be after check-in date.'); return; }

    setIsLoading(true);
    setError(null);
    const msgs = ['Crafting your trip...', `Exploring ${tripDetails.destination}...`, 'Finding hidden gems...', 'Building your itinerary...', 'Almost ready...'];
    let idx = 0;
    setLoadingMsg(msgs[0]);
    const interval = setInterval(() => { idx = (idx + 1) % msgs.length; setLoadingMsg(msgs[idx]); }, 4000);

    try {
      const res = await fetch('/api/generate-trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: tripDetails.destination, guests: tripDetails.guests, tripType: tripDetails.tripType, budget: tripDetails.budget, vibe: tripDetails.vibe, checkIn: tripDetails.checkIn, checkOut: tripDetails.checkOut }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Server error: ${res.status}`); }
      const plan = await res.json();
      setGeneratedPlan(plan);
      setOpenDay(0);
      setActiveTab('itinerary');
      showToast('✨ Your personalized itinerary is ready!');
      if (user && !user.isGuest) {
        saveTrip(user.uid, { destination: tripDetails.destination, checkIn: tripDetails.checkIn, checkOut: tripDetails.checkOut, guests: tripDetails.guests, tripType: tripDetails.tripType, budget: tripDetails.budget, vibe: tripDetails.vibe }, plan)
          .then(() => loadTrips(user.uid).then(setSavedTrips))
          .catch(console.error);
      }
    } catch (err: any) {
      setError(`Failed to generate plan: ${err?.message || 'Unknown error. Please try again.'}`);
    } finally {
      clearInterval(interval);
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (msg?: string) => {
    const message = msg || chatInput;
    if (!message.trim()) return;
    setChatHistory((p) => [...p, { role: 'user', content: message }]);
    setChatInput('');
    setIsTyping(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history: chatHistory,
          tripContext: {
            destination: tripDetails.destination,
            checkIn: tripDetails.checkIn,
            checkOut: tripDetails.checkOut,
            budget: tripDetails.budget,
            tripType: tripDetails.tripType,
            selectedHotel: selectedHotel ? { name: selectedHotel.name, location: selectedHotel.location } : null,
          },
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Server error: ${res.status}`); }
      const data = await res.json();
      setChatHistory((p) => [...p, { role: 'model', content: data.reply || "I'm sorry, I couldn't process that." }]);
    } catch (err: any) {
      const errMsg = err?.message || '';
      const friendlyMsg = errMsg.includes('quota') || errMsg.includes('429')
        ? "I'm a bit overwhelmed right now — quota limit hit. Please try again in a minute! 🙏"
        : errMsg.includes('busy') || errMsg.includes('503')
        ? "I'm a little busy at the moment. Give me a second and try again!"
        : "Oops! I'm having trouble connecting. Please try again.";
      setChatHistory((p) => [...p, { role: 'model', content: friendlyMsg }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSignIn = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (err) { console.error('Sign in failed:', err); }
  };

  const handleSignInAsGuest = () => {
    setUser({ uid: 'guest_' + Date.now(), displayName: 'Guest', email: null, photoURL: null, isGuest: true });
  };

  const handleSignOut = async () => {
    if (user?.isGuest) {
      setUser(null);
    } else {
      await signOut(auth);
    }
    setGeneratedPlan(null);
    setSavedTrips([]);
    setSelectedHotel(null);
  };

  const handleDownloadItinerary = () => {
    if (!generatedPlan) return;
    const lines: string[] = ['TREEBO AI TRIP PLANNER', '='.repeat(40), `${tripDetails.destination} · ${formatDate(tripDetails.checkIn)} to ${formatDate(tripDetails.checkOut)}`, `Hotel: ${selectedHotel?.name || 'Not selected'}`, `Guests: ${tripDetails.guests} · ${tripDetails.tripType}`, ''];
    generatedPlan.days.forEach((day) => {
      lines.push(day.label, '-'.repeat(30));
      [...(day.morning || []), ...(day.afternoon || []), ...(day.evening || [])].forEach((a) => {
        lines.push(`  ${a.emoji} ${a.name} — ₹${a.cost_inr} (${a.duration_hours}h, ${a.distance_from_hotel_km}km away)`, `     ${a.description}`);
      });
      lines.push('');
    });
    lines.push(`Total Estimated Cost: ₹${generatedPlan.trip_summary?.total_estimated_cost_inr?.toLocaleString('en-IN')}`, `\nAI Tip: ${generatedPlan.trip_summary?.top_tip}`, '\nGenerated by Treebo AI Trip Planner');
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Treebo_Trip_${tripDetails.destination}_${tripDetails.checkIn}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Itinerary downloaded!');
  };

  const isFormComplete = !!(tripDetails.destination && tripDetails.checkIn && tripDetails.checkOut && tripDetails.tripType);

  // ─── Tab Renderers ───────────────────────────────────────────────────────────

  const renderPlanTab = () => {
    const labelCls = 'text-[12px] font-semibold text-treebo-muted uppercase tracking-wide flex items-center gap-1.5';
    const labelPlainCls = 'text-[12px] font-semibold text-treebo-muted uppercase tracking-wide';
    const tripTypeBtnCls = (t: string) =>
      `py-2.5 rounded-xl text-[13px] font-medium transition-all border text-center ${tripDetails.tripType === t ? 'bg-treebo-teal text-white border-treebo-teal shadow-sm' : 'bg-white text-treebo-muted border-treebo-border hover:border-treebo-teal/50'}`;
    return (
    <div className="space-y-7 pb-28">
      <div className="space-y-1 pt-2">
        <p className="text-[11px] font-semibold text-treebo-teal uppercase tracking-[0.12em]">Plan your escape</p>
        <h2 className="text-[28px] font-display font-semibold text-treebo-text leading-tight">Where to <em>next?</em></h2>
        <p className="text-[13px] text-treebo-muted">Tell us your vibe, we'll handle the rest.</p>
      </div>

      <div className="space-y-6">
        {/* Destination */}
        <div className="space-y-2.5">
          <div className="flex justify-between items-center">
            <label className={labelCls}>
              <MapPin size={12} className="text-treebo-teal" /> Destination
            </label>
            <button
              onClick={() => window.open(`https://maps.google.com/maps?q=${encodeURIComponent(tripDetails.destination + ', India')}`, '_blank')}
              className="text-[12px] font-medium text-treebo-teal flex items-center gap-1 hover:underline underline-offset-2 transition-colors"
            >
              <MapIcon size={12} /> View on map
            </button>
          </div>
          {/* horizontal scroll — spacer span ensures last chip has right padding */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
            {CITIES.map((city) => (
              <button
                key={city}
                onClick={() => setTripDetails({ ...tripDetails, destination: city })}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-[13px] font-medium transition-all duration-150 border whitespace-nowrap ${
                  tripDetails.destination === city
                    ? 'bg-treebo-teal text-white border-treebo-teal shadow-sm'
                    : 'bg-white text-treebo-muted border-treebo-border hover:border-treebo-teal/50 hover:text-treebo-teal'
                }`}
              >
                {city}
              </button>
            ))}
            <span className="flex-shrink-0 w-4 block" aria-hidden="true" />
          </div>
        </div>

        {/* Map Modal */}
        <AnimatePresence>
          {showMapModal && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6">
              <motion.div initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} className="bg-white w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl border border-treebo-border">
                <div className="p-5 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-[17px] font-display font-semibold text-treebo-text">Pick Destination</h3>
                    <button onClick={() => setShowMapModal(false)} className="p-1.5 hover:bg-treebo-tag rounded-lg transition-colors"><X size={16} className="text-treebo-muted" /></button>
                  </div>
                  <div className="aspect-square bg-treebo-tag rounded-xl relative overflow-hidden border border-treebo-border">
                    <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''}>
                      <Map style={{ width: '100%', height: '100%' }} defaultCenter={{ lat: 20.5937, lng: 78.9629 }} defaultZoom={4} gestureHandling="greedy" disableDefaultUI mapId="treebo_planner_map">
                        {Object.entries(CITY_COORDS).map(([name, coords]) => (
                          <AdvancedMarker key={name} position={coords} onClick={() => { setTripDetails({ ...tripDetails, destination: name }); setShowMapModal(false); }}>
                            <div className={`p-1.5 rounded-full shadow-md transition-all ${tripDetails.destination === name ? 'bg-treebo-teal scale-125' : 'bg-white border border-treebo-border hover:scale-110'}`}>
                              <MapPin size={14} className={tripDetails.destination === name ? 'text-white' : 'text-treebo-teal'} />
                            </div>
                          </AdvancedMarker>
                        ))}
                      </Map>
                    </APIProvider>
                  </div>
                  <p className="text-[11px] text-treebo-muted text-center">Tap a city pin to select your destination</p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className={labelCls}><Calendar size={12} className="text-treebo-teal" /> Check-in</label>
            <input type="date" className="input-field" min={getTodayStr()} value={tripDetails.checkIn} onChange={(e) => { const v = e.target.value; setTripDetails((p) => ({ ...p, checkIn: v, checkOut: p.checkOut && p.checkOut <= v ? '' : p.checkOut })); }} />
          </div>
          <div className="space-y-2">
            <label className={labelCls}><Calendar size={12} className="text-treebo-teal" /> Check-out</label>
            <input type="date" className="input-field" min={tripDetails.checkIn || getTodayStr()} value={tripDetails.checkOut} onChange={(e) => setTripDetails({ ...tripDetails, checkOut: e.target.value })} />
          </div>
        </div>

        {/* Guests */}
        <div className="space-y-2">
          <label className={labelCls}><Users size={12} className="text-treebo-teal" /> Guests</label>
          <div className="flex items-center justify-between bg-white border border-treebo-border rounded-xl px-4 py-3 text-[14px] focus-within:ring-2 focus-within:ring-treebo-teal/15 focus-within:border-treebo-teal transition-all">
            <button onClick={() => setTripDetails({ ...tripDetails, guests: Math.max(1, tripDetails.guests - 1) })} className="p-0.5 hover:bg-treebo-tag rounded-md text-treebo-teal transition-colors"><Minus size={16} /></button>
            <span className="font-semibold text-treebo-text text-[15px]">{tripDetails.guests}</span>
            <button onClick={() => setTripDetails({ ...tripDetails, guests: Math.min(8, tripDetails.guests + 1) })} className="p-0.5 hover:bg-treebo-tag rounded-md text-treebo-teal transition-colors"><Plus size={16} /></button>
          </div>
        </div>

        {/* Trip Type — 3+2 grid so chips don't orphan */}
        <div className="space-y-2">
          <label className={labelCls}><Briefcase size={12} className="text-treebo-teal" /> Trip Type</label>
          <div className="grid grid-cols-3 gap-2">
            {TRIP_TYPES.slice(0, 3).map((t) => (
              <button key={t} onClick={() => setTripDetails({ ...tripDetails, tripType: t })} className={tripTypeBtnCls(t)}>{t}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {TRIP_TYPES.slice(3).map((t) => (
              <button key={t} onClick={() => setTripDetails({ ...tripDetails, tripType: t })} className={tripTypeBtnCls(t)}>{t}</button>
            ))}
          </div>
        </div>

        {/* Budget — slider with live progress fill */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className={labelPlainCls}>Budget per night</label>
            <span className="text-[13px] font-bold text-treebo-teal bg-treebo-teal-light px-3 py-1 rounded-full">
              ₹{tripDetails.budget.toLocaleString('en-IN')}
            </span>
          </div>
          <input
            type="range" min="500" max="10000" step="100"
            className="w-full cursor-pointer"
            value={tripDetails.budget}
            style={{ '--progress': `${((tripDetails.budget - 500) / (10000 - 500)) * 100}%` } as React.CSSProperties}
            onChange={(e) => setTripDetails({ ...tripDetails, budget: parseInt(e.target.value) })}
          />
          <div className="flex justify-between text-[12px] text-treebo-muted font-medium px-1"><span>₹500</span><span>₹10,000</span></div>
        </div>

        {/* Vibe */}
        <div className="space-y-2.5">
          <label className={labelCls}><Sparkles size={12} className="text-treebo-teal" /> Trip Vibe</label>
          <div className="flex flex-wrap gap-2">
            {VIBES.map((v) => (
              <Chip key={v} label={v} selected={tripDetails.vibe.includes(v)} onClick={() => { const nv = tripDetails.vibe.includes(v) ? tripDetails.vibe.filter((x) => x !== v) : [...tripDetails.vibe, v]; setTripDetails({ ...tripDetails, vibe: nv }); }} />
            ))}
          </div>
        </div>

        <p className="text-[12px] text-treebo-muted text-center">View saved trips via <span className="text-treebo-teal font-semibold">My Trip History</span> in the profile menu.</p>

        {error && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3 text-[13px]">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-red-500" /><span>{error}</span>
          </motion.div>
        )}

        <button
          onClick={generateTripPlan}
          disabled={isLoading || !isFormComplete}
          className={`w-full bg-treebo-teal text-white font-semibold py-4 rounded-xl text-[15px] transition-all active:scale-[0.98] hover:bg-treebo-teal-dark flex items-center justify-center gap-2 shadow-button ${!isFormComplete || isLoading ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          {isLoading ? (<><Loader2 className="animate-spin" size={19} /><span>{loadingMsg}</span></>) : (<><span>Generate My Trip Plan</span><Sparkles size={18} /></>)}
        </button>
      </div>
    </div>
  );
  };

  const renderHotelsTab = () => (
    <div className="space-y-5 pb-28">
      <div className="pt-2">
        <p className="text-[11px] font-semibold text-treebo-teal uppercase tracking-[0.12em] mb-0.5">Available properties</p>
        <h2 className="text-[24px] font-display font-semibold text-treebo-text leading-tight">Hotels in <em>{tripDetails.destination}</em></h2>
      </div>

      {selectedHotel && (
        <div className="bg-treebo-teal-light border border-treebo-teal/30 rounded-xl px-4 py-3 flex items-center gap-3">
          <CheckCircle2 size={16} className="text-treebo-teal flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-treebo-teal">Selected hotel</p>
            <p className="text-[13px] text-treebo-text truncate">{selectedHotel.name}</p>
          </div>
          <button onClick={() => setSelectedHotel(null)} className="text-treebo-muted hover:text-red-500 transition-colors"><X size={14} /></button>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        <button className="bg-treebo-teal text-white px-4 py-2 rounded-full text-[12px] font-medium whitespace-nowrap">All Hotels</button>
        <button className="bg-white text-treebo-muted border border-treebo-border px-4 py-2 rounded-full text-[12px] font-medium whitespace-nowrap hover:border-treebo-teal/40 transition-colors">Price: Low–High</button>
        <button className="bg-white text-treebo-muted border border-treebo-border px-4 py-2 rounded-full text-[12px] font-medium whitespace-nowrap hover:border-treebo-teal/40 transition-colors">Top Rated</button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredHotels.map((hotel) => (
          <HotelCard
            key={hotel.id}
            hotel={hotel}
            isRecommended={!!generatedPlan && hotel.price <= tripDetails.budget + 500}
            isSelected={selectedHotel?.id === hotel.id}
            onSelect={(h) => { setSelectedHotel(h); showToast(`🏨 ${h.name} added to your trip!`); }}
            onViewDetails={(h) => setViewingHotel(h)}
          />
        ))}
      </div>
    </div>
  );

  const renderItineraryTab = () => {
    if (!generatedPlan) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-5 px-4">
          <div className="w-20 h-20 rounded-2xl bg-treebo-tag border border-treebo-border flex items-center justify-center text-gray-300"><ClipboardList size={36} /></div>
          <div className="space-y-2 max-w-xs">
            <h3 className="text-xl font-display font-semibold text-treebo-text">No itinerary yet</h3>
            <p className="text-treebo-muted text-[13px] leading-relaxed">Generate a trip plan first to see your personalized day-by-day schedule.</p>
          </div>
          <button onClick={() => setActiveTab('plan')} className="bg-treebo-teal text-white px-8 py-3 rounded-xl font-semibold text-[14px] shadow-button active:scale-[0.98] hover:bg-treebo-teal-dark transition-all">Start Planning</button>
        </div>
      );
    }

    // Budget snapshot
    const nights = tripDetails.checkIn && tripDetails.checkOut
      ? Math.max(1, Math.round((new Date(tripDetails.checkOut).getTime() - new Date(tripDetails.checkIn).getTime()) / 86400000))
      : generatedPlan.days.length;
    const hotelCost = (selectedHotel?.price || 0) * nights;
    const actCost = generatedPlan.days.flatMap((d) => [...(d.morning || []), ...(d.afternoon || []), ...(d.evening || [])]).reduce((s, a) => s + (a.cost_inr || 0), 0);
    const foodCost = 800 * nights;
    const totalCost = hotelCost + actCost + foodCost;

    return (
      <div className="space-y-5 pb-28">
        {savedTrips.length > 0 && (
          <button onClick={() => setActiveTab('history')} className="flex items-center gap-1.5 text-[13px] text-treebo-muted hover:text-treebo-teal transition-colors pt-1">
            <ChevronRight size={14} className="rotate-180" /> Back to History
          </button>
        )}

        {/* Summary Card */}
        <div className="bg-treebo-teal rounded-2xl p-5 text-white relative overflow-hidden">
          <div className="absolute inset-0 dot-pattern opacity-100" />
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50 mb-1">Your itinerary</p>
                <h2 className="text-[22px] font-display font-semibold leading-tight">{generatedPlan.trip_summary?.destination || tripDetails.destination}</h2>
                <p className="text-[12px] text-white/60 mt-0.5">{formatDate(tripDetails.checkIn)} — {formatDate(tripDetails.checkOut)}</p>
              </div>
              <div className="bg-white/15 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-white/10">{generatedPlan.days?.length || 0} days</div>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {generatedPlan.trip_summary?.vibe_tags?.map((tag, i) => (
                <span key={i} className="bg-white/10 text-white/70 text-[11px] px-2.5 py-0.5 rounded-full border border-white/10">{tag}</span>
              ))}
            </div>
            <div className="flex items-end justify-between pt-4 border-t border-white/15">
              <div>
                <p className="text-[10px] text-white/50 font-medium uppercase tracking-wider mb-0.5">Est. total</p>
                <p className="text-[26px] font-display font-semibold leading-none">₹{generatedPlan.trip_summary?.total_estimated_cost_inr?.toLocaleString('en-IN') || 0}</p>
              </div>
              <div className="text-right max-w-[52%]">
                <p className="text-[10px] text-white/50 font-medium uppercase tracking-wider mb-1">AI Tip</p>
                <p className="text-[12px] italic text-white/75 leading-snug">"{generatedPlan.trip_summary?.top_tip || 'Enjoy your trip!'}"</p>
              </div>
            </div>
          </div>
        </div>

        {/* Budget Breakdown Card */}
        <div className="bg-white border border-treebo-teal/25 rounded-2xl overflow-hidden shadow-card">
          <div className="bg-treebo-teal-light px-4 py-3 border-b border-treebo-teal/15">
            <p className="text-[11px] font-semibold text-treebo-teal uppercase tracking-wider">Budget Breakdown</p>
          </div>
          <div className="divide-y divide-treebo-border">
            {[
              { label: `Hotel (${nights} night${nights !== 1 ? 's' : ''})`, value: hotelCost, note: selectedHotel ? `₹${selectedHotel.price}/night · ${selectedHotel.name.split(' ').slice(-2).join(' ')}` : 'No hotel selected yet' },
              { label: 'Activities & Experiences', value: actCost, note: `${generatedPlan.days.flatMap((d) => [...(d.morning || []), ...(d.afternoon || []), ...(d.evening || [])]).length} activities` },
              { label: 'Food & Drinks (est.)', value: foodCost, note: `₹800/day × ${nights} days` },
            ].map((row, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-[13px] text-treebo-text font-medium">{row.label}</p>
                  <p className="text-[11px] text-treebo-muted">{row.note}</p>
                </div>
                <p className={`text-[14px] font-semibold ${row.value === 0 ? 'text-treebo-muted' : 'text-treebo-teal'}`}>{row.value === 0 ? '—' : `₹${row.value.toLocaleString('en-IN')}`}</p>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3 bg-treebo-teal-light">
              <p className="text-[14px] font-semibold text-treebo-teal">Total Estimated</p>
              <p className="text-[16px] font-display font-semibold text-treebo-teal">₹{totalCost.toLocaleString('en-IN')}</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2.5">
          <div className="flex-1 bg-treebo-teal-light border border-treebo-teal/20 text-treebo-teal py-2.5 rounded-xl text-[13px] font-medium flex items-center justify-center gap-1.5">
            <CheckCircle2 size={14} /> Saved
          </div>
          <button onClick={handleDownloadItinerary} className="flex-1 bg-white border border-treebo-border text-treebo-muted py-2.5 rounded-xl text-[13px] font-medium flex items-center justify-center gap-1.5 active:scale-[0.98] hover:border-treebo-teal/40 hover:text-treebo-teal transition-all shadow-card">
            <Download size={14} /> Download
          </button>
          <button
            onClick={async () => {
              const text = `My ${tripDetails.destination} trip plan (${formatDate(tripDetails.checkIn)} – ${formatDate(tripDetails.checkOut)}) via Treebo AI Planner!`;
              if (navigator.share) { await navigator.share({ title: `Treebo Trip to ${tripDetails.destination}`, text }); }
              else { await navigator.clipboard.writeText(text); showToast('Trip details copied to clipboard!'); }
            }}
            className="flex-1 bg-white border border-treebo-border text-treebo-muted py-2.5 rounded-xl text-[13px] font-medium flex items-center justify-center gap-1.5 active:scale-[0.98] hover:border-treebo-teal/40 hover:text-treebo-teal transition-all shadow-card"
          >
            <Share2 size={14} /> Share
          </button>
        </div>

        {/* Days — Accordion */}
        <div className="space-y-3">
          {generatedPlan.days?.map((day, idx) => {
            const isOpen = openDay === idx;
            return (
              <div key={idx} className="bg-white border border-treebo-border rounded-2xl overflow-hidden shadow-card">
                <button
                  onClick={() => setOpenDay(isOpen ? -1 : idx)}
                  className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-treebo-tag/30 transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-treebo-amber text-white flex items-center justify-center font-display font-semibold text-[15px] shadow-button-amber flex-shrink-0">{day.day}</div>
                  <h3 className="font-display font-semibold text-treebo-text text-[15px] flex-1">{day.label}</h3>
                  <ChevronDown size={16} className={`text-treebo-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-4 border-t border-treebo-border">
                        {(['morning', 'afternoon', 'evening'] as const).map((time) => {
                          const activities = (day[time] as Activity[]) || [];
                          if (!activities.length) return null;
                          return (
                            <div key={time} className="space-y-2.5 relative pl-4 border-l-2 border-treebo-border ml-2 mt-4">
                              <div className="absolute -left-[5px] top-[2px] w-2.5 h-2.5 rounded-full bg-treebo-teal" />
                              <h4 className="text-[10px] font-semibold text-treebo-muted uppercase tracking-wider mb-2">{time}</h4>
                              {activities.map((act, i) => (
                                <div key={i} className="bg-treebo-tag/40 p-4 rounded-xl border border-treebo-border space-y-2">
                                  <div className="flex justify-between items-start gap-2">
                                    <div className="flex gap-2.5 flex-1">
                                      <span className="text-xl leading-none mt-0.5">{act.emoji}</span>
                                      <div className="flex-1 min-w-0">
                                        <h5 className="font-semibold text-[14px] text-treebo-text leading-snug">{act.name}</h5>
                                        <p className="text-[12px] text-treebo-muted mt-0.5 leading-relaxed">{act.description}</p>
                                      </div>
                                    </div>
                                    <span className="text-[11px] font-semibold text-treebo-teal bg-treebo-teal-light px-2 py-0.5 rounded-md flex-shrink-0">₹{act.cost_inr}</span>
                                  </div>
                                  <div className="flex items-center gap-4 text-[11px] text-treebo-muted">
                                    <div className="flex items-center gap-1"><Clock size={11} /> {act.duration_hours}h</div>
                                    <div className="flex items-center gap-1"><MapPin size={11} /> {act.distance_from_hotel_km}km away</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                        <div onClick={() => setActiveTab('hotels')} className="bg-treebo-amber-light border border-treebo-amber/25 rounded-xl p-4 flex items-center justify-between cursor-pointer hover:border-treebo-amber/50 transition-colors group mt-2">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-treebo-amber flex items-center justify-center"><Hotel size={16} className="text-white" /></div>
                            <div>
                              <p className="text-[10px] font-semibold text-treebo-amber uppercase tracking-wider">Stay tonight</p>
                              <p className="text-[13px] font-semibold text-treebo-text mt-0.5">{selectedHotel?.name || filteredHotels[0]?.name || 'Treebo Trend Hotel'}</p>
                            </div>
                          </div>
                          <ArrowRight size={16} className="text-treebo-amber group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderHistoryTab = () => (
    <div className="space-y-5 pb-28">
      <div className="pt-2">
        <p className="text-[11px] font-semibold text-treebo-teal uppercase tracking-[0.12em] mb-0.5">Your travel story</p>
        <h2 className="text-[24px] font-display font-semibold text-treebo-text leading-tight">Trip <em>History</em></h2>
        <p className="text-[13px] text-treebo-muted mt-1">All your planned adventures, saved forever.</p>
      </div>

      {user?.isGuest ? (
        <div className="flex flex-col items-center justify-center h-[50vh] text-center space-y-4 px-4">
          <div className="w-20 h-20 rounded-2xl bg-treebo-tag border border-treebo-border flex items-center justify-center"><User size={32} className="text-gray-300" /></div>
          <div className="space-y-1.5 max-w-xs">
            <h3 className="text-xl font-display font-semibold text-treebo-text">Sign in to save trips</h3>
            <p className="text-treebo-muted text-[13px] leading-relaxed">Create a Google account to save your itineraries and access them from any device.</p>
          </div>
          <button onClick={() => { setUser(null); }} className="bg-treebo-teal text-white px-8 py-3 rounded-xl font-semibold text-[14px] shadow-button active:scale-[0.98] hover:bg-treebo-teal-dark transition-all">Sign in with Google</button>
        </div>
      ) : tripsLoading ? (
        <div className="flex flex-col items-center justify-center h-[50vh] gap-3"><Loader2 size={28} className="animate-spin text-treebo-teal" /><p className="text-[13px] text-treebo-muted">Loading your trips...</p></div>
      ) : savedTrips.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[50vh] text-center space-y-4 px-4">
          <div className="w-20 h-20 rounded-2xl bg-treebo-tag border border-treebo-border flex items-center justify-center"><Clock size={32} className="text-gray-300" /></div>
          <div className="space-y-1.5 max-w-xs">
            <h3 className="text-xl font-display font-semibold text-treebo-text">No trips yet</h3>
            <p className="text-treebo-muted text-[13px] leading-relaxed">Your generated itineraries will be saved here automatically.</p>
          </div>
          <button onClick={() => setActiveTab('plan')} className="bg-treebo-teal text-white px-8 py-3 rounded-xl font-semibold text-[14px] shadow-button active:scale-[0.98] hover:bg-treebo-teal-dark transition-all">Plan Your First Trip</button>
        </div>
      ) : (
        <div className="space-y-3">
          {savedTrips.map((trip, idx) => (
            <motion.div key={trip.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} className="bg-white border border-treebo-border rounded-2xl overflow-hidden shadow-card">
              <div className={`h-2 w-full ${idx === 0 ? 'bg-treebo-teal' : 'bg-treebo-border'}`} />
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-[16px] font-display font-semibold text-treebo-text">{trip.destination}</h3>
                      {idx === 0 && <span className="text-[10px] bg-treebo-amber text-white px-2 py-0.5 rounded-full font-semibold">Latest</span>}
                    </div>
                    <p className="text-[12px] text-treebo-muted">{formatDate(trip.checkIn)} → {formatDate(trip.checkOut)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-treebo-muted">Saved on</p>
                    <p className="text-[12px] font-semibold text-treebo-text">{trip.createdAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  <span className="bg-treebo-tag text-treebo-muted text-[11px] px-2.5 py-0.5 rounded-full border border-treebo-border">{trip.guests} {trip.tripType}</span>
                  <span className="bg-treebo-tag text-treebo-muted text-[11px] px-2.5 py-0.5 rounded-full border border-treebo-border">₹{trip.budget}/night</span>
                  {trip.vibe.slice(0, 2).map((v) => <span key={v} className="bg-treebo-teal-light text-treebo-teal text-[11px] px-2.5 py-0.5 rounded-full border border-treebo-teal/20">{v}</span>)}
                </div>
                <button
                  onClick={() => { setTripDetails({ destination: trip.destination, checkIn: trip.checkIn, checkOut: trip.checkOut, guests: trip.guests, tripType: trip.tripType, budget: trip.budget, vibe: trip.vibe }); setGeneratedPlan(trip.plan as TripPlan); setOpenDay(0); setActiveTab('itinerary'); }}
                  className="w-full bg-treebo-teal text-white py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] hover:bg-treebo-teal-dark transition-all shadow-button"
                >
                  <ClipboardList size={14} /> View Itinerary
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );

  // Bug 2 & 3: chat uses its own flex layout — no fixed positioning, no 100vh
  const renderChatTab = () => (
    <div className="flex flex-col flex-1 min-h-0 -mx-5">
      {/* Messages scroll area */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5">
        {chatHistory.length === 0 ? (
          // flex-col with min-h-full so spacer pushes chips to bottom inside overflow-y-auto parent
          <div className="flex flex-col min-h-full">
            <div className="flex flex-col items-center pt-8 pb-4 px-2 text-center">
              <div className="w-14 h-14 rounded-2xl bg-treebo-teal-light flex items-center justify-center mb-3">
                <Sparkles size={24} className="text-treebo-teal" />
              </div>
              <h3 className="font-display font-semibold text-treebo-text text-[18px]">Treebo AI Assistant</h3>
              <p className="text-[13px] text-treebo-muted mt-1">Ask me anything about your trip to {tripDetails.destination}.</p>
            </div>
            <div className="flex-1" />
            <div className="px-0 pb-4 space-y-2">
              {[`Best food in ${tripDetails.destination}?`, 'What should I pack?', `Hidden gems in ${tripDetails.destination}`, 'Budget tips for this trip'].map((p) => (
                <button key={p} onClick={() => handleSendMessage(p)}
                  className="w-full text-left px-4 py-3 rounded-2xl border border-treebo-border bg-white text-[13px] text-treebo-text hover:border-treebo-teal hover:bg-treebo-teal/5 transition-colors">
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-4">
            {chatHistory.map((msg, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[82%] px-4 py-3 rounded-2xl text-[14px] leading-relaxed ${msg.role === 'user' ? 'bg-treebo-teal text-white rounded-br-sm font-medium' : 'bg-white text-treebo-text border border-treebo-border rounded-bl-sm shadow-card flex gap-2.5'}`}>
                  {msg.role === 'model' && <div className="w-6 h-6 rounded-md bg-treebo-teal flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold mt-0.5">T</div>}
                  {msg.role === 'model' ? (
                    <div className="[&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:my-1.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-1.5 [&_li]:mb-1 [&_p]:mb-1.5 [&_strong]:font-semibold [&_strong]:text-treebo-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                  ) : <div>{msg.content}</div>}
                </div>
              </motion.div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white px-4 py-3 rounded-2xl rounded-bl-sm border border-treebo-border shadow-card flex gap-1.5 items-center">
                  <div className="w-1.5 h-1.5 bg-treebo-teal/40 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-treebo-teal/40 rounded-full animate-bounce [animation-delay:0.15s]" />
                  <div className="w-1.5 h-1.5 bg-treebo-teal/40 rounded-full animate-bounce [animation-delay:0.3s]" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* Input bar — in normal flow, not fixed. Sits above bottom nav naturally. */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-treebo-border bg-treebo-bg/95 backdrop-blur-sm">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Ask anything about your trip..."
            className="flex-1 bg-white border border-treebo-border rounded-full px-4 py-3 text-[14px] text-treebo-text placeholder:text-gray-400 focus:outline-none focus:border-treebo-teal transition-all"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          />
          <button onClick={() => handleSendMessage()} className="w-12 h-12 bg-treebo-teal text-white rounded-full flex items-center justify-center shadow-button active:scale-90 transition-all hover:bg-treebo-teal-dark flex-shrink-0">
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );

  // ─── Auth Screens ────────────────────────────────────────────────────────────

  if (authLoading) {
    return <div className="min-h-screen bg-treebo-bg flex items-center justify-center"><Loader2 size={28} className="animate-spin text-treebo-teal" /></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center">
        <div className="w-full max-w-[430px] bg-treebo-bg min-h-screen flex flex-col items-center justify-center px-8 gap-8">
          <div className="flex flex-col items-center gap-3">
            <img src="/treebo-icon.svg" alt="Treebo" className="w-20 h-20" />
            <div className="text-center">
              <h1 className="text-[32px] font-display font-semibold text-treebo-teal leading-tight">treebo</h1>
              <p className="text-[14px] text-treebo-muted font-light tracking-wide">ai trip planner</p>
            </div>
          </div>

          <div className="text-center space-y-2 max-w-xs">
            <h2 className="text-[22px] font-display font-semibold text-treebo-text leading-snug">Plan your perfect trip</h2>
            <p className="text-[13px] text-treebo-muted leading-relaxed">Sign in to generate personalised itineraries, browse Treebo hotels, and save your trip history.</p>
          </div>

          <div className="w-full space-y-3">
            <button onClick={handleSignIn} className="w-full flex items-center justify-center gap-3 bg-white border border-treebo-border rounded-xl px-6 py-4 text-[15px] font-semibold text-treebo-text shadow-card hover:shadow-card-hover active:scale-[0.98] transition-all">
              <svg width="20" height="20" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.29-8.16 2.29-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Continue with Google
            </button>

            <button onClick={handleSignInAsGuest} className="w-full py-3 px-4 rounded-xl border-2 border-[#00695C] text-[#00695C] font-medium text-[14px] bg-transparent hover:bg-[#00695C]/5 active:scale-[0.98] transition-all">
              Explore without signing in →
            </button>
          </div>

          <p className="text-[11px] text-treebo-muted text-center leading-relaxed max-w-[260px]">
            Guest mode lets you plan and explore. Sign in with Google to save your history across devices.
          </p>
        </div>
      </div>
    );
  }

  // ─── Main App ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100 flex justify-center">
      <div className="w-full max-w-[430px] bg-treebo-bg h-screen h-dvh overflow-hidden relative shadow-xl flex flex-col">
        <Header user={user} onSignOut={handleSignOut} onShowHistory={() => setActiveTab('history')} />

        <main className={`flex-1 pt-[56px] ${activeTab === 'chat' ? 'overflow-hidden flex flex-col pb-16' : 'px-5 overflow-y-auto no-scrollbar'}`}>
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className={activeTab === 'chat' ? 'flex-1 min-h-0 flex flex-col' : ''}>
              {activeTab === 'plan' && renderPlanTab()}
              {activeTab === 'hotels' && renderHotelsTab()}
              {activeTab === 'itinerary' && (
                <TripErrorBoundary onReset={() => setGeneratedPlan(null)}>
                  {renderItineraryTab()}
                </TripErrorBoundary>
              )}
              {activeTab === 'history' && renderHistoryTab()}
              {activeTab === 'chat' && renderChatTab()}
            </motion.div>
          </AnimatePresence>
        </main>

        <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} hasItinerary={!!generatedPlan} />

        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }} className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] bg-treebo-teal text-white px-5 py-3 rounded-xl text-[13px] font-semibold shadow-lg flex items-center gap-2 whitespace-nowrap">
              <CheckCircle2 size={15} /> {toast}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hotel Detail Bottom Sheet */}
        <AnimatePresence>
          {viewingHotel && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 z-40" onClick={() => setViewingHotel(null)} />
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-w-[430px] mx-auto overflow-hidden"
              >
                <div className={`h-48 bg-gradient-to-br ${viewingHotel.imageGradient} relative`}>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  <button onClick={() => setViewingHotel(null)} className="absolute top-4 right-4 bg-black/30 p-2 rounded-full"><X size={16} className="text-white" /></button>
                  <div className="absolute bottom-4 left-4">
                    <h3 className="text-white text-[18px] font-display font-semibold leading-snug">{viewingHotel.name}</h3>
                    <div className="flex items-center gap-1.5 mt-1"><MapPin size={11} className="text-white/70" /><span className="text-white/80 text-[12px]">{viewingHotel.location}</span></div>
                  </div>
                </div>

                <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 bg-treebo-teal text-white px-2.5 py-1 rounded-lg">
                      <Star size={12} fill="white" /><span className="text-[13px] font-semibold">{viewingHotel.rating} / 5.0</span>
                    </div>
                    <div><span className="text-[24px] font-display font-semibold text-treebo-teal">₹{viewingHotel.price}</span><span className="text-[12px] text-treebo-muted ml-1">/ night</span></div>
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold text-treebo-muted uppercase tracking-wider mb-2">Amenities</p>
                    <div className="flex flex-wrap gap-2">
                      {viewingHotel.amenities.map((a, i) => (
                        <span key={i} className="flex items-center gap-1.5 bg-treebo-tag border border-treebo-border text-treebo-text text-[12px] px-3 py-1.5 rounded-xl">
                          <CheckCircle2 size={11} className="text-treebo-teal" /> {a}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold text-treebo-muted uppercase tracking-wider mb-2">Policies</p>
                    <div className="space-y-1.5 text-[13px] text-treebo-muted">
                      <p>• Check-in: 12:00 PM · Check-out: 11:00 AM</p>
                      <p>• Free cancellation up to 24 hours before check-in</p>
                      <p>• Couple-friendly · ID proof required at check-in</p>
                      <p>• Treebo Assured quality guarantee</p>
                    </div>
                  </div>

                  <button
                    onClick={() => { setSelectedHotel(viewingHotel); setViewingHotel(null); showToast(`🏨 ${viewingHotel.name} added to your trip!`); }}
                    className={`w-full py-4 rounded-xl text-[15px] font-semibold transition-all active:scale-[0.98] ${selectedHotel?.id === viewingHotel.id ? 'bg-treebo-teal-light text-treebo-teal border border-treebo-teal/30' : 'bg-treebo-amber text-white hover:bg-amber-500 shadow-button-amber'}`}
                  >
                    {selectedHotel?.id === viewingHotel.id ? '✓ Already Selected' : 'Book This Hotel'}
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
