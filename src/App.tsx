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
  Star, 
  Wifi, 
  Wind, 
  Car, 
  Coffee, 
  Clock, 
  CheckCircle2, 
  Send, 
  Plus, 
  Minus, 
  Calendar, 
  Users, 
  Briefcase, 
  Heart, 
  User, 
  Sparkles,
  ArrowRight,
  Download,
  Share2,
  AlertCircle,
  Loader2,
  Map as MapIcon,
  X,
  Navigation
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
// API calls are proxied through Vercel serverless functions
import { saveTrip, loadTrips, type SavedTrip } from './tripStore';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useMap
} from '@vis.gl/react-google-maps';

// --- Types ---

interface CityData {
  name: string;
  lat: number;
  lng: number;
}

const CITY_COORDS: Record<string, { lat: number, lng: number }> = {
  'Delhi': { lat: 28.6139, lng: 77.2090 },
  'Mumbai': { lat: 19.0760, lng: 72.8777 },
  'Bangalore': { lat: 12.9716, lng: 77.5946 },
  'Goa': { lat: 15.2993, lng: 74.1240 },
  'Manali': { lat: 32.2432, lng: 77.1892 },
  'Jaipur': { lat: 26.9124, lng: 75.7873 },
  'Hyderabad': { lat: 17.3850, lng: 78.4867 },
  'Coorg': { lat: 12.3375, lng: 75.8069 },
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

// --- Markdown renderer for chat messages ---
function renderMarkdown(raw: string): string {
  // Strip any existing HTML to prevent XSS
  let text = raw.replace(/<[^>]*>/g, '');
  // Bold
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic
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

// --- Mock Data ---

const CITIES = ["Delhi", "Mumbai", "Bangalore", "Jaipur", "Goa", "Manali", "Coorg", "Hyderabad"];
const TRIP_TYPES = ["Solo", "Couple", "Family", "Friends", "Work"];
const VIBES = ["Adventure", "Relaxation", "Culture", "Food & Nightlife", "Nature", "City Exploration"];

const MOCK_HOTELS: HotelData[] = [
  // Goa
  { id: 'g1', name: "Treebo Trend Amber Heights", location: "Near Calangute Beach, Goa", rating: 4.2, price: 2400, amenities: ["Free WiFi", "AC", "Breakfast", "Swimming Pool"], imageGradient: "from-blue-400 to-teal-500", city: "Goa" },
  { id: 'g2', name: "Treebo Trend Dona Julia", location: "Candolim, Goa", rating: 3.8, price: 1800, amenities: ["Free WiFi", "AC", "Parking"], imageGradient: "from-teal-400 to-emerald-500", city: "Goa" },
  { id: 'g3', name: "Treebo Trend Green Park", location: "Mapusa, Goa", rating: 4.5, price: 3200, amenities: ["Free WiFi", "AC", "Breakfast", "24/7 Check-in"], imageGradient: "from-emerald-400 to-green-500", city: "Goa" },
  { id: 'g4', name: "Treebo Trend Ocean View", location: "Anjuna, Goa", rating: 4.0, price: 2100, amenities: ["Free WiFi", "AC", "Parking", "Breakfast"], imageGradient: "from-cyan-400 to-blue-500", city: "Goa" },
  { id: 'g5', name: "Treebo Trend Sea Breeze", location: "Baga, Goa", rating: 3.6, price: 1500, amenities: ["Free WiFi", "AC"], imageGradient: "from-blue-500 to-indigo-500", city: "Goa" },
  { id: 'g6', name: "Treebo Trend Palm Grove", location: "Vagator, Goa", rating: 4.1, price: 2800, amenities: ["Free WiFi", "AC", "Breakfast", "Parking"], imageGradient: "from-teal-500 to-cyan-600", city: "Goa" },
  
  // Delhi
  { id: 'd1', name: "Treebo Trend Signature", location: "Near Connaught Place, Delhi", rating: 4.3, price: 3500, amenities: ["Free WiFi", "AC", "Breakfast", "Parking"], imageGradient: "from-orange-400 to-red-500", city: "Delhi" },
  { id: 'd2', name: "Treebo Trend Metro Inn", location: "Karol Bagh, Delhi", rating: 3.9, price: 2200, amenities: ["Free WiFi", "AC", "24/7 Check-in"], imageGradient: "from-red-400 to-pink-500", city: "Delhi" },
  
  // Bangalore
  { id: 'b1', name: "Treebo Trend Silicon Hearth", location: "Koramangala, Bangalore", rating: 4.4, price: 2900, amenities: ["Free WiFi", "AC", "Breakfast", "Parking"], imageGradient: "from-purple-400 to-indigo-500", city: "Bangalore" },

  // Mumbai
  { id: 'm1', name: "Treebo Trend De Grandeur", location: "Andheri East, Mumbai", rating: 4.1, price: 3800, amenities: ["Free WiFi", "AC", "Breakfast"], imageGradient: "from-blue-600 to-cyan-700", city: "Mumbai" },
  { id: 'm2', name: "Treebo Trend Sea Side", location: "Juhu, Mumbai", rating: 3.9, price: 4200, amenities: ["Free WiFi", "AC", "Parking"], imageGradient: "from-cyan-600 to-blue-800", city: "Mumbai" },

  // Jaipur
  { id: 'j1', name: "Treebo Trend Royal Sun", location: "Bani Park, Jaipur", rating: 4.3, price: 2100, amenities: ["Free WiFi", "AC", "Breakfast", "Parking"], imageGradient: "from-orange-500 to-amber-600", city: "Jaipur" },
  { id: 'j2', name: "Treebo Trend Pink City", location: "Near Hawa Mahal, Jaipur", rating: 4.0, price: 1800, amenities: ["Free WiFi", "AC", "24/7 Check-in"], imageGradient: "from-pink-500 to-red-600", city: "Jaipur" },

  // Manali
  { id: 'mn1', name: "Treebo Trend Snow View", location: "Old Manali, Manali", rating: 4.6, price: 2800, amenities: ["Free WiFi", "Heater", "Breakfast", "Mountain View"], imageGradient: "from-blue-100 to-blue-300", city: "Manali" },
  { id: 'mn2', name: "Treebo Trend River Side", location: "Near Beas River, Manali", rating: 4.2, price: 2400, amenities: ["Free WiFi", "Heater", "Parking"], imageGradient: "from-cyan-200 to-blue-400", city: "Manali" },

  // Coorg
  { id: 'c1', name: "Treebo Trend Coffee Estate", location: "Madikeri, Coorg", rating: 4.5, price: 3200, amenities: ["Free WiFi", "Breakfast", "Nature Walk"], imageGradient: "from-green-600 to-emerald-800", city: "Coorg" },
  { id: 'c2', name: "Treebo Trend Misty Hills", location: "Kushalnagar, Coorg", rating: 4.1, price: 2600, amenities: ["Free WiFi", "AC", "Parking"], imageGradient: "from-emerald-500 to-green-700", city: "Coorg" },

  // Hyderabad
  { id: 'h1', name: "Treebo Trend Pearl City", location: "Banjara Hills, Hyderabad", rating: 4.3, price: 2900, amenities: ["Free WiFi", "AC", "Breakfast", "Parking"], imageGradient: "from-indigo-600 to-purple-700", city: "Hyderabad" },
  { id: 'h2', name: "Treebo Trend Cyber Inn", location: "Hitech City, Hyderabad", rating: 4.0, price: 2500, amenities: ["Free WiFi", "AC", "24/7 Check-in"], imageGradient: "from-purple-500 to-indigo-600", city: "Hyderabad" },
];

// --- Components ---

const Header = () => (
  <header className="fixed top-0 left-0 right-0 z-50 bg-treebo-bg/95 backdrop-blur-sm border-b border-treebo-border px-5 py-2.5 flex justify-between items-center">
    <div className="flex items-center gap-2">
      <img src="/treebo-icon.svg" alt="Treebo" className="w-9 h-9" />
      <div className="flex items-baseline gap-1.5">
        <h1 className="text-[18px] font-display font-semibold text-treebo-teal tracking-tight leading-none">treebo</h1>
        <span className="text-[10px] text-treebo-muted font-sans font-light tracking-wide leading-none">ai planner</span>
      </div>
    </div>
    <div className="w-8 h-8 rounded-full bg-treebo-tag border border-treebo-border flex items-center justify-center">
      <User size={14} className="text-treebo-muted" />
    </div>
  </header>
);

const BottomNav = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (tab: string) => void }) => {
  const tabs = [
    { id: 'plan', label: 'Plan', icon: MapPin },
    { id: 'hotels', label: 'Hotels', icon: Hotel },
    { id: 'itinerary', label: 'Trip', icon: ClipboardList },
    { id: 'chat', label: 'AI Chat', icon: MessageSquare },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-treebo-border px-2 pt-2 pb-6 flex justify-around items-center">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl transition-all duration-200 min-w-[60px] ${
              isActive ? 'text-treebo-teal' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <div className={`p-1.5 rounded-lg transition-all duration-200 ${isActive ? 'bg-treebo-teal-light' : ''}`}>
              <Icon size={20} strokeWidth={isActive ? 2 : 1.5} />
            </div>
            <span className={`text-[10px] font-medium leading-none ${isActive ? 'text-treebo-teal' : 'text-gray-400'}`}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

const Chip = ({ label, selected, onClick, multi = false }: { label: string, selected: boolean, onClick: () => void, multi?: boolean }) => (
  <button
    onClick={onClick}
    className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all duration-150 border ${
      selected
        ? 'bg-treebo-teal text-white border-treebo-teal shadow-sm'
        : 'bg-white text-treebo-muted border-treebo-border hover:border-treebo-teal/50 hover:text-treebo-teal'
    }`}
  >
    {label}
  </button>
);

const HotelCard = ({ hotel, isRecommended }: { hotel: HotelData, isRecommended: boolean }) => (
  <motion.div
    whileHover={{ y: -2 }}
    transition={{ duration: 0.15 }}
    className="bg-white rounded-2xl overflow-hidden border border-treebo-border shadow-card relative group"
  >
    {isRecommended && (
      <div className="absolute top-3 right-3 z-10 bg-treebo-teal text-white text-[10px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
        <Sparkles size={9} />
        AI Pick
      </div>
    )}

    <div className={`h-40 bg-gradient-to-br ${hotel.imageGradient} relative overflow-hidden`}>
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
      <Hotel size={44} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/20" />
      <div className="absolute bottom-2.5 left-3 z-10 flex items-center gap-1 bg-black/25 text-white text-[10px] font-medium px-2 py-1 rounded border border-white/20">
        <CheckCircle2 size={9} />
        Treebo Assured
      </div>
    </div>

    <div className="p-4">
      <div className="flex justify-between items-start mb-1">
        <h3 className="font-display font-semibold text-[15px] text-treebo-text leading-snug pr-2">{hotel.name}</h3>
        <div className="flex items-center gap-0.5 bg-treebo-teal text-white px-1.5 py-0.5 rounded text-[11px] font-semibold flex-shrink-0">
          <Star size={10} fill="white" />
          {hotel.rating}
        </div>
      </div>

      <div className="flex items-center gap-1 text-treebo-muted text-[12px] mb-3">
        <MapPin size={10} />
        {hotel.location}
      </div>

      <div className="flex flex-wrap gap-1 mb-4">
        {hotel.amenities?.slice(0, 3).map((amenity, idx) => (
          <span key={idx} className="bg-treebo-tag text-treebo-muted text-[11px] px-2 py-0.5 rounded border border-treebo-border">
            {amenity}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <span className="text-[22px] font-display font-semibold text-treebo-teal leading-none">₹{hotel.price}</span>
          <span className="text-[11px] text-treebo-muted ml-1">/ night</span>
        </div>
        <button className="bg-treebo-amber text-white font-semibold text-[12px] px-4 py-2 rounded-lg transition-all hover:bg-amber-500 active:scale-95 shadow-button-amber">
          Book Now
        </button>
      </div>
    </div>
  </motion.div>
);

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState('plan');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Trip Details State
  const [tripDetails, setTripDetails] = useState({
    destination: 'Goa',
    checkIn: '',
    checkOut: '',
    guests: 2,
    tripType: 'Couple',
    budget: 2500,
    vibe: [] as string[]
  });

  const [generatedPlan, setGeneratedPlan] = useState<TripPlan | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isTyping]);

  useEffect(() => {
    setTripsLoading(true);
    loadTrips()
      .then(setSavedTrips)
      .catch(console.error)
      .finally(() => setTripsLoading(false));
  }, []);

  const filteredHotels = useMemo(() => {
    const hotels = MOCK_HOTELS.filter(h => h.city === tripDetails.destination);
    return hotels.length > 0 ? hotels : MOCK_HOTELS.filter(h => h.city === 'Goa'); // Default to Goa if somehow city missing
  }, [tripDetails.destination]);

  const generateTripPlan = async () => {
    if (!tripDetails.checkIn || !tripDetails.checkOut) {
      setError("Please select travel dates first!");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/generate-trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: tripDetails.destination,
          guests: tripDetails.guests,
          tripType: tripDetails.tripType,
          budget: tripDetails.budget,
          vibe: tripDetails.vibe,
          checkIn: tripDetails.checkIn,
          checkOut: tripDetails.checkOut,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${res.status}`);
      }

      const plan = await res.json();
      setGeneratedPlan(plan);
      setActiveTab('itinerary');
      setToast("✨ Your personalized itinerary is ready!");

      // Save to Firebase in the background
      saveTrip(
        {
          destination: tripDetails.destination,
          checkIn: tripDetails.checkIn,
          checkOut: tripDetails.checkOut,
          guests: tripDetails.guests,
          tripType: tripDetails.tripType,
          budget: tripDetails.budget,
          vibe: tripDetails.vibe,
        },
        plan
      )
        .then(() => loadTrips().then(setSavedTrips))
        .catch(console.error);
    } catch (err: any) {
      console.error(err);
      setError(`Failed to generate plan: ${err?.message || 'Unknown error. Check console for details.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (msg?: string) => {
    const message = msg || chatInput;
    if (!message.trim()) return;

    const newUserMessage: ChatMessage = { role: 'user', content: message };
    setChatHistory(prev => [...prev, newUserMessage]);
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
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${res.status}`);
      }

      const data = await res.json();
      const aiResponse: ChatMessage = { role: 'model', content: data.reply || "I'm sorry, I couldn't process that." };
      setChatHistory(prev => [...prev, aiResponse]);
    } catch (err: any) {
      console.error(err);
      setChatHistory(prev => [...prev, { role: 'model', content: `Error: ${err?.message || "Oops! I'm having trouble connecting. Can you try again?"}` }]);
    } finally {
      setIsTyping(false);
    }
  };

  const [showMapModal, setShowMapModal] = useState(false);

  const renderPlanTab = () => (
    <div className="space-y-7 pb-28">
      <div className="space-y-1 pt-2">
        <p className="text-[11px] font-semibold text-treebo-teal uppercase tracking-[0.12em]">Plan your escape</p>
        <h2 className="text-[28px] font-display font-semibold text-treebo-text leading-tight">
          Where to <em>next?</em>
        </h2>
        <p className="text-[13px] text-treebo-muted">Tell us your vibe, we'll handle the rest.</p>
      </div>

      <div className="space-y-6">
        {/* Destination */}
        <div className="space-y-2.5">
          <div className="flex justify-between items-center">
            <label className="text-[11px] font-semibold text-treebo-muted uppercase tracking-wider flex items-center gap-1.5">
              <MapPin size={11} className="text-treebo-teal" /> Destination
            </label>
            <button
              onClick={() => setShowMapModal(true)}
              className="text-[11px] font-medium text-treebo-teal flex items-center gap-1 hover:underline underline-offset-2 transition-colors"
            >
              <MapIcon size={11} /> View on map
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {CITIES.map(city => (
              <Chip
                key={city}
                label={city}
                selected={tripDetails.destination === city}
                onClick={() => setTripDetails({ ...tripDetails, destination: city })}
              />
            ))}
          </div>
        </div>

        {/* Map Modal */}
        <AnimatePresence>
          {showMapModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0.95, y: 16 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-white w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl border border-treebo-border"
              >
                <div className="p-5 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-[17px] font-display font-semibold text-treebo-text">Pick Destination</h3>
                    <button onClick={() => setShowMapModal(false)} className="p-1.5 hover:bg-treebo-tag rounded-lg transition-colors">
                      <X size={16} className="text-treebo-muted" />
                    </button>
                  </div>

                  <div className="aspect-square bg-treebo-tag rounded-xl relative overflow-hidden border border-treebo-border">
                    <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''}>
                      <Map
                        style={{ width: '100%', height: '100%' }}
                        defaultCenter={{ lat: 20.5937, lng: 78.9629 }} // Center of India
                        defaultZoom={4}
                        gestureHandling={'greedy'}
                        disableDefaultUI={true}
                        mapId={'treebo_planner_map'}
                      >
                        {Object.entries(CITY_COORDS).map(([name, coords]) => (
                          <AdvancedMarker
                            key={name}
                            position={coords}
                            onClick={() => {
                              setTripDetails({ ...tripDetails, destination: name });
                              setShowMapModal(false);
                            }}
                          >
                            <div className={`p-1.5 rounded-full shadow-md transition-all ${
                              tripDetails.destination === name ? 'bg-treebo-teal scale-125' : 'bg-white border border-treebo-border hover:scale-110'
                            }`}>
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
            <label className="text-[11px] font-semibold text-treebo-muted uppercase tracking-wider flex items-center gap-1.5">
              <Calendar size={11} className="text-treebo-teal" /> Check-in
            </label>
            <input
              type="date"
              className="input-field"
              value={tripDetails.checkIn}
              onChange={(e) => setTripDetails({ ...tripDetails, checkIn: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-treebo-muted uppercase tracking-wider flex items-center gap-1.5">
              <Calendar size={11} className="text-treebo-teal" /> Check-out
            </label>
            <input
              type="date"
              className="input-field"
              value={tripDetails.checkOut}
              onChange={(e) => setTripDetails({ ...tripDetails, checkOut: e.target.value })}
            />
          </div>
        </div>

        {/* Guests & Type */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-treebo-muted uppercase tracking-wider flex items-center gap-1.5">
              <Users size={11} className="text-treebo-teal" /> Guests
            </label>
            <div className="flex items-center justify-between bg-white border border-treebo-border rounded-xl px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-treebo-teal/15 focus-within:border-treebo-teal transition-all">
              <button
                onClick={() => setTripDetails({ ...tripDetails, guests: Math.max(1, tripDetails.guests - 1) })}
                className="p-0.5 hover:bg-treebo-tag rounded-md text-treebo-teal transition-colors"
              >
                <Minus size={16} />
              </button>
              <span className="font-semibold text-treebo-text text-[15px]">{tripDetails.guests}</span>
              <button
                onClick={() => setTripDetails({ ...tripDetails, guests: Math.min(8, tripDetails.guests + 1) })}
                className="p-0.5 hover:bg-treebo-tag rounded-md text-treebo-teal transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-treebo-muted uppercase tracking-wider flex items-center gap-1.5">
              <Briefcase size={11} className="text-treebo-teal" /> Trip Type
            </label>
            <select
              className="input-field appearance-none"
              value={tripDetails.tripType}
              onChange={(e) => setTripDetails({ ...tripDetails, tripType: e.target.value })}
            >
              {TRIP_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
        </div>

        {/* Budget */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-[11px] font-semibold text-treebo-muted uppercase tracking-wider">Budget per night</label>
            <span className="text-[13px] font-semibold text-treebo-teal bg-treebo-teal-light px-3 py-1 rounded-lg">₹{tripDetails.budget}</span>
          </div>
          <input
            type="range"
            min="500"
            max="5000"
            step="100"
            className="w-full cursor-pointer"
            value={tripDetails.budget}
            onChange={(e) => setTripDetails({ ...tripDetails, budget: parseInt(e.target.value) })}
          />
          <div className="flex justify-between text-[11px] text-treebo-muted font-medium">
            <span>₹500</span>
            <span>₹5,000</span>
          </div>
        </div>

        {/* Vibe */}
        <div className="space-y-2.5">
          <label className="text-[11px] font-semibold text-treebo-muted uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles size={11} className="text-treebo-teal" /> Trip Vibe
          </label>
          <div className="flex flex-wrap gap-2">
            {VIBES.map(vibe => (
              <Chip
                key={vibe}
                label={vibe}
                selected={tripDetails.vibe.includes(vibe)}
                onClick={() => {
                  const newVibes = tripDetails.vibe.includes(vibe)
                    ? tripDetails.vibe.filter(v => v !== vibe)
                    : [...tripDetails.vibe, vibe];
                  setTripDetails({ ...tripDetails, vibe: newVibes });
                }}
              />
            ))}
          </div>
        </div>

        {/* My Trips */}
        {(savedTrips.length > 0 || tripsLoading) && (
          <div className="space-y-2.5">
            <label className="text-[11px] font-semibold text-treebo-muted uppercase tracking-wider flex items-center gap-1.5">
              <ClipboardList size={11} className="text-treebo-teal" /> My Saved Trips
            </label>
            {tripsLoading ? (
              <div className="flex items-center gap-2 text-treebo-muted text-[13px]">
                <Loader2 size={14} className="animate-spin" /> Loading trips...
              </div>
            ) : (
              <div className="space-y-2">
                {savedTrips.map(trip => (
                  <button
                    key={trip.id}
                    onClick={() => {
                      setTripDetails({
                        destination: trip.destination,
                        checkIn: trip.checkIn,
                        checkOut: trip.checkOut,
                        guests: trip.guests,
                        tripType: trip.tripType,
                        budget: trip.budget,
                        vibe: trip.vibe,
                      });
                      setGeneratedPlan(trip.plan as TripPlan);
                      setActiveTab('itinerary');
                    }}
                    className="w-full bg-white border border-treebo-border rounded-xl px-4 py-3 flex items-center justify-between gap-3 hover:border-treebo-teal/40 hover:shadow-card-hover active:scale-[0.99] transition-all text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-treebo-text truncate">{trip.destination}</p>
                      <p className="text-[11px] text-treebo-muted mt-0.5">{trip.checkIn} → {trip.checkOut} · {trip.guests} {trip.tripType}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[11px] text-treebo-muted">{trip.createdAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                      <ChevronRight size={14} className="text-treebo-muted" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3 text-[13px]"
          >
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-red-500" />
            <span>{error}</span>
          </motion.div>
        )}

        <button
          onClick={generateTripPlan}
          disabled={isLoading}
          className="w-full bg-treebo-amber text-white font-semibold py-4 rounded-xl text-[15px] transition-all active:scale-[0.98] hover:bg-amber-500 flex items-center justify-center gap-2 disabled:opacity-60 shadow-button-amber"
        >
          {isLoading ? (
            <>
              <Loader2 className="animate-spin" size={19} />
              <span>Crafting your trip...</span>
            </>
          ) : (
            <>
              <span>Generate My Trip Plan</span>
              <Sparkles size={18} />
            </>
          )}
        </button>
      </div>
    </div>
  );

  const renderHotelsTab = () => (
    <div className="space-y-5 pb-28">
      <div className="flex justify-between items-center pt-2">
        <div>
          <p className="text-[11px] font-semibold text-treebo-teal uppercase tracking-[0.12em] mb-0.5">Available properties</p>
          <h2 className="text-[24px] font-display font-semibold text-treebo-text leading-tight">
            Hotels in <em>{tripDetails.destination}</em>
          </h2>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        <button className="bg-treebo-teal text-white px-4 py-2 rounded-full text-[12px] font-medium whitespace-nowrap">All Hotels</button>
        <button className="bg-white text-treebo-muted border border-treebo-border px-4 py-2 rounded-full text-[12px] font-medium whitespace-nowrap hover:border-treebo-teal/40 transition-colors">Price: Low–High</button>
        <button className="bg-white text-treebo-muted border border-treebo-border px-4 py-2 rounded-full text-[12px] font-medium whitespace-nowrap hover:border-treebo-teal/40 transition-colors">Top Rated</button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredHotels.map(hotel => (
          <HotelCard
            key={hotel.id}
            hotel={hotel}
            isRecommended={generatedPlan ? hotel.price <= tripDetails.budget + 500 : false}
          />
        ))}
      </div>
    </div>
  );

  const renderItineraryTab = () => {
    if (!generatedPlan) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-5 px-4">
          <div className="w-20 h-20 rounded-2xl bg-treebo-tag border border-treebo-border flex items-center justify-center text-gray-300">
            <ClipboardList size={36} />
          </div>
          <div className="space-y-2 max-w-xs">
            <h3 className="text-xl font-display font-semibold text-treebo-text">No itinerary yet</h3>
            <p className="text-treebo-muted text-[13px] leading-relaxed">Generate a trip plan first to see your personalized day-by-day schedule.</p>
          </div>
          <button
            onClick={() => setActiveTab('plan')}
            className="bg-treebo-teal text-white px-8 py-3 rounded-xl font-semibold text-[14px] shadow-button active:scale-[0.98] hover:bg-treebo-teal-dark transition-all"
          >
            Start Planning
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-5 pb-28">
        {/* Summary Card */}
        <div className="bg-treebo-teal rounded-2xl p-5 text-white relative overflow-hidden">
          <div className="absolute inset-0 dot-pattern opacity-100" />
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50 mb-1">Your itinerary</p>
                <h2 className="text-[22px] font-display font-semibold leading-tight">
                  {generatedPlan.trip_summary?.destination || tripDetails.destination}
                </h2>
                <p className="text-[12px] text-white/60 mt-0.5">{tripDetails.checkIn} — {tripDetails.checkOut}</p>
              </div>
              <div className="bg-white/15 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-white/10">
                {generatedPlan.days?.length || 0} days
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-4">
              {generatedPlan.trip_summary?.vibe_tags?.map((tag, i) => (
                <span key={i} className="bg-white/10 text-white/70 text-[11px] px-2.5 py-0.5 rounded-full border border-white/10">
                  {tag}
                </span>
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

        <div className="flex gap-2.5">
          <button
            onClick={() => setToast("Itinerary saved to your Treebo account!")}
            className="flex-1 bg-white border border-treebo-border text-treebo-muted py-2.5 rounded-xl text-[13px] font-medium flex items-center justify-center gap-1.5 active:scale-[0.98] hover:border-treebo-teal/40 hover:text-treebo-teal transition-all shadow-card"
          >
            <Download size={14} /> Save
          </button>
          <button className="flex-1 bg-white border border-treebo-border text-treebo-muted py-2.5 rounded-xl text-[13px] font-medium flex items-center justify-center gap-1.5 active:scale-[0.98] hover:border-treebo-teal/40 hover:text-treebo-teal transition-all shadow-card">
            <Share2 size={14} /> Share
          </button>
        </div>

        {/* Days */}
        <div className="space-y-8">
          {generatedPlan.days?.map((day, idx) => (
            <div key={idx} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-treebo-amber text-white flex items-center justify-center font-display font-semibold text-[15px] shadow-button-amber">
                  {day.day}
                </div>
                <h3 className="font-display font-semibold text-treebo-text text-[16px]">{day.label}</h3>
              </div>

              {['morning', 'afternoon', 'evening'].map((time) => {
                const activities = (day[time as keyof DayPlan] as Activity[]) || [];
                return (
                  <div key={time} className="space-y-2.5 relative pl-4 border-l-2 border-treebo-border ml-4">
                    <div className="absolute -left-[5px] top-[2px] w-2.5 h-2.5 rounded-full bg-treebo-teal" />
                    <h4 className="text-[10px] font-semibold text-treebo-muted uppercase tracking-wider mb-2">{time}</h4>
                    {activities.map((act, i) => (
                      <div key={i} className="bg-white p-4 rounded-xl border border-treebo-border shadow-card space-y-2">
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex gap-2.5 flex-1">
                            <span className="text-xl leading-none mt-0.5">{act.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <h5 className="font-semibold text-[14px] text-treebo-text leading-snug">{act.name}</h5>
                              <p className="text-[12px] text-treebo-muted line-clamp-1 mt-0.5">{act.description}</p>
                            </div>
                          </div>
                          <span className="text-[11px] font-semibold text-treebo-teal bg-treebo-teal-light px-2 py-0.5 rounded-md flex-shrink-0">₹{act.cost_inr}</span>
                        </div>
                        <div className="flex items-center gap-4 text-[11px] text-treebo-muted">
                          <div className="flex items-center gap-1">
                            <Clock size={11} /> {act.duration_hours}h
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin size={11} /> {act.distance_from_hotel_km}km away
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}

              {/* Stay Tonight Card */}
              <div
                onClick={() => setActiveTab('hotels')}
                className="bg-treebo-amber-light border border-treebo-amber/25 rounded-xl p-4 flex items-center justify-between cursor-pointer hover:border-treebo-amber/50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-treebo-amber flex items-center justify-center">
                    <Hotel size={16} className="text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-treebo-amber uppercase tracking-wider">Stay tonight</p>
                    <p className="text-[13px] font-semibold text-treebo-text mt-0.5">{filteredHotels[0]?.name || "Treebo Trend Hotel"}</p>
                  </div>
                </div>
                <ArrowRight size={16} className="text-treebo-amber group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderChatTab = () => (
    <div className="flex flex-col h-[calc(100vh-180px)] pb-28">
      <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 p-1">
        {chatHistory.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-5 px-4">
            <div className="w-14 h-14 rounded-2xl bg-treebo-teal-light flex items-center justify-center">
              <Sparkles size={24} className="text-treebo-teal" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-display font-semibold text-treebo-text text-[18px]">Treebo AI Assistant</h3>
              <p className="text-[13px] text-treebo-muted">Ask me anything about your trip to {tripDetails.destination}.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 max-w-[280px]">
              {["What should I pack?", "Best local food?", "Is it safe solo?", "Weekend activities"].map(prompt => (
                <button
                  key={prompt}
                  onClick={() => handleSendMessage(prompt)}
                  className="bg-white border border-treebo-border text-treebo-muted px-4 py-2 rounded-full text-[12px] font-medium hover:border-treebo-teal/50 hover:text-treebo-teal transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {chatHistory.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[82%] px-4 py-3 rounded-2xl text-[14px] leading-relaxed ${
              msg.role === 'user'
                ? 'bg-treebo-teal text-white rounded-br-sm font-medium'
                : 'bg-white text-treebo-text border border-treebo-border rounded-bl-sm shadow-card flex gap-2.5'
            }`}>
              {msg.role === 'model' && (
                <div className="w-6 h-6 rounded-md bg-treebo-teal flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold mt-0.5">
                  T
                </div>
              )}
              {msg.role === 'model' ? (
                <div
                  className="[&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:my-1.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-1.5 [&_li]:mb-1 [&_p]:mb-1.5 [&_strong]:font-semibold [&_strong]:text-treebo-text"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                />
              ) : (
                <div>{msg.content}</div>
              )}
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

      <div className="fixed bottom-[64px] left-0 right-0 px-4 py-3 bg-treebo-bg/95 backdrop-blur-sm border-t border-treebo-border max-w-[430px] mx-auto">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Ask anything about your trip..."
            className="flex-1 bg-white border border-treebo-border rounded-xl px-4 py-3 text-[14px] text-treebo-text placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-treebo-teal/15 focus:border-treebo-teal transition-all"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          />
          <button
            onClick={() => handleSendMessage()}
            className="bg-treebo-teal text-white p-3 rounded-xl shadow-button active:scale-90 transition-all hover:bg-treebo-teal-dark"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 flex justify-center">
      <div className="w-full max-w-[430px] bg-treebo-bg min-h-screen relative shadow-xl flex flex-col">
        <Header />

        <main className="flex-1 pt-[60px] px-5 overflow-y-auto no-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'plan' && renderPlanTab()}
              {activeTab === 'hotels' && renderHotelsTab()}
              {activeTab === 'itinerary' && renderItineraryTab()}
              {activeTab === 'chat' && renderChatTab()}
            </motion.div>
          </AnimatePresence>
        </main>

        <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Toast Notification */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] bg-treebo-teal text-white px-5 py-3 rounded-xl text-[13px] font-semibold shadow-lg flex items-center gap-2 whitespace-nowrap"
            >
              <CheckCircle2 size={15} />
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
