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
import { GoogleGenAI, Type } from "@google/genai";
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
  <header className="fixed top-0 left-0 right-0 z-50 bg-treebo-bg/80 backdrop-blur-xl border-b border-white/[0.06] px-6 py-4 flex justify-between items-center">
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-treebo-teal/10 border border-treebo-teal/25 flex items-center justify-center shadow-inner">
        <Hotel size={17} className="text-treebo-teal" />
      </div>
      <div>
        <h1 className="text-[19px] font-display font-bold tracking-tight leading-none text-white">treebo</h1>
        <p className="text-[9px] uppercase tracking-[0.18em] text-treebo-teal/60 font-medium">AI Trip Planner</p>
      </div>
    </div>
    <div className="w-9 h-9 rounded-xl bg-surface-2 border border-white/10 flex items-center justify-center">
      <User size={16} className="text-gray-400" />
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
    <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-surface-2/95 backdrop-blur-xl border border-white/10 p-1.5 rounded-[28px] shadow-2xl shadow-black/60">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex items-center gap-2 rounded-[20px] text-xs font-bold transition-all duration-300 ${
              isActive
                ? 'bg-treebo-teal text-treebo-bg shadow-lg shadow-treebo-teal/30 px-4 py-2.5'
                : 'text-gray-500 hover:text-gray-300 px-3 py-2.5'
            }`}
          >
            <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
            {isActive && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                className="font-bold tracking-tight whitespace-nowrap overflow-hidden"
              >
                {tab.label}
              </motion.span>
            )}
          </button>
        );
      })}
    </nav>
  );
};

const Chip = ({ label, selected, onClick, multi = false }: { label: string, selected: boolean, onClick: () => void, multi?: boolean }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border ${
      selected
        ? 'bg-treebo-teal/15 text-treebo-teal border-treebo-teal/40 shadow-sm'
        : 'bg-surface-2 text-gray-400 border-white/10 hover:border-white/20 hover:text-gray-300'
    }`}
  >
    {label}
  </button>
);

const HotelCard = ({ hotel, isRecommended }: { hotel: HotelData, isRecommended: boolean }) => (
  <motion.div
    whileHover={{ y: -4, scale: 1.01 }}
    transition={{ duration: 0.2 }}
    className="bg-surface rounded-2xl overflow-hidden border border-white/[0.06] shadow-xl relative group"
  >
    {isRecommended && (
      <div className="absolute top-3 right-0 z-10 bg-treebo-amber text-treebo-bg text-[10px] font-bold px-3 py-1 rounded-l-full shadow-md flex items-center gap-1">
        <Sparkles size={9} />
        AI PICK
      </div>
    )}

    <div className={`h-44 bg-gradient-to-br ${hotel.imageGradient} flex items-center justify-center relative overflow-hidden`}>
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      <Hotel size={52} className="text-white/15 relative z-0" />
      <div className="absolute bottom-3 left-3 z-10 bg-black/40 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded-lg border border-white/15 flex items-center gap-1.5">
        <CheckCircle2 size={9} className="text-treebo-teal" />
        TREEBO ASSURED
      </div>
    </div>

    <div className="p-4">
      <div className="flex justify-between items-start mb-1.5">
        <h3 className="font-display font-bold text-white leading-tight">{hotel.name}</h3>
        <div className="flex items-center gap-1 bg-treebo-teal/15 text-treebo-teal px-2 py-0.5 rounded-lg text-xs font-bold flex-shrink-0 ml-2">
          <Star size={11} fill="currentColor" />
          {hotel.rating}
        </div>
      </div>

      <div className="flex items-center gap-1 text-gray-500 text-xs mb-3">
        <MapPin size={11} />
        {hotel.location}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {hotel.amenities?.slice(0, 3).map((amenity, idx) => (
          <span key={idx} className="bg-white/5 text-gray-500 text-[10px] px-2 py-0.5 rounded-full border border-white/10">
            {amenity}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <span className="text-xl font-display font-bold text-treebo-teal">₹{hotel.price}</span>
          <span className="text-[10px] text-gray-600 ml-1">/ night</span>
        </div>
        <button className="bg-treebo-amber hover:bg-amber-400 text-treebo-bg font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-md shadow-treebo-amber/20 active:scale-95 hover:shadow-treebo-amber/35">
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
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY! });
      const model = ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{
          role: 'user',
          parts: [{
            text: `Plan a trip to ${tripDetails.destination} for ${tripDetails.guests} ${tripDetails.tripType} traveler(s). Budget per night for hotel: ₹${tripDetails.budget}. Trip vibe: ${tripDetails.vibe.join(', ')}. Dates: ${tripDetails.checkIn} to ${tripDetails.checkOut}.`
          }]
        }],
        config: {
          systemInstruction: `You are Treebo's AI Trip Planner. Generate a detailed, day-by-day travel itinerary in JSON format based on the trip details provided. Include morning, afternoon, and evening activities. Each activity must have: name, emoji, description (1 sentence), duration_hours (number), cost_inr (number), distance_from_hotel_km (number). Also include a trip_summary with destination, total_estimated_cost_inr, top_tip, and vibe_tags (array). Return ONLY valid JSON, no markdown blocks.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              trip_summary: {
                type: Type.OBJECT,
                properties: {
                  destination: { type: Type.STRING },
                  total_estimated_cost_inr: { type: Type.NUMBER },
                  top_tip: { type: Type.STRING },
                  vibe_tags: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["destination", "total_estimated_cost_inr", "top_tip", "vibe_tags"]
              },
              days: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    day: { type: Type.NUMBER },
                    label: { type: Type.STRING },
                    morning: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, emoji: { type: Type.STRING }, description: { type: Type.STRING }, duration_hours: { type: Type.NUMBER }, cost_inr: { type: Type.NUMBER }, distance_from_hotel_km: { type: Type.NUMBER } } } },
                    afternoon: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, emoji: { type: Type.STRING }, description: { type: Type.STRING }, duration_hours: { type: Type.NUMBER }, cost_inr: { type: Type.NUMBER }, distance_from_hotel_km: { type: Type.NUMBER } } } },
                    evening: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, emoji: { type: Type.STRING }, description: { type: Type.STRING }, duration_hours: { type: Type.NUMBER }, cost_inr: { type: Type.NUMBER }, distance_from_hotel_km: { type: Type.NUMBER } } } }
                  }
                }
              }
            }
          }
        }
      });

      const response = await model;
      let text = response.text || '{}';
      // Clean up markdown if present
      text = text.replace(/```json\n?/, '').replace(/```\n?/, '').trim();
      const plan = JSON.parse(text);
      setGeneratedPlan(plan);
      setActiveTab('itinerary');
      setToast("✨ Your personalized itinerary is ready!");
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
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY! });

      // Convert our chatHistory to the format expected by the SDK
      const history = chatHistory.map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));

      const chat = ai.chats.create({
        model: "gemini-2.5-flash",
        history: history,
        config: {
          systemInstruction: `You are Treebo's friendly travel assistant. The user is planning a trip to ${tripDetails.destination} from ${tripDetails.checkIn} to ${tripDetails.checkOut}. They are interested in a Treebo hotel (budget: ₹${tripDetails.budget}/night). Be concise, warm, practical. Mention Treebo hotel amenities (Free WiFi, AC, Breakfast, Assured quality) where relevant. Never recommend competitor hotels.`,
        }
      });

      const response = await chat.sendMessage({ message });
      const aiResponse: ChatMessage = { role: 'model', content: response.text || "I'm sorry, I couldn't process that." };
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
        <h2 className="text-3xl font-display font-bold text-white leading-tight">Where to next?</h2>
        <p className="text-gray-500 text-sm">Tell us your vibe, we'll handle the rest.</p>
      </div>

      <div className="space-y-6">
        {/* Destination */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-[11px] font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
              <MapPin size={12} className="text-treebo-teal" /> Destination
            </label>
            <button
              onClick={() => setShowMapModal(true)}
              className="text-[10px] font-bold text-treebo-teal flex items-center gap-1 hover:text-treebo-teal/70 transition-colors"
            >
              <MapIcon size={11} /> Map View
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
              className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-surface w-full max-w-sm rounded-[28px] overflow-hidden shadow-2xl border border-white/10"
              >
                <div className="p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-display font-bold text-white">Pick Destination</h3>
                    <button onClick={() => setShowMapModal(false)} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                      <X size={18} className="text-gray-400" />
                    </button>
                  </div>

                  <div className="aspect-square bg-surface-2 rounded-2xl relative overflow-hidden border border-white/10">
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
                            <div className={`p-1.5 rounded-full shadow-lg transition-all ${
                              tripDetails.destination === name ? 'bg-treebo-amber scale-125' : 'bg-surface-2 border border-white/20 hover:scale-110'
                            }`}>
                              <MapPin size={16} className={tripDetails.destination === name ? 'text-treebo-bg' : 'text-treebo-teal'} />
                            </div>
                          </AdvancedMarker>
                        ))}
                      </Map>
                    </APIProvider>
                  </div>

                  <p className="text-[10px] text-gray-600 text-center">Tap a city pin to set your destination</p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
              <Calendar size={12} className="text-treebo-teal" /> Check-in
            </label>
            <input
              type="date"
              className="w-full bg-surface-2 border border-white/10 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:border-treebo-teal/50 transition-colors [color-scheme:dark]"
              value={tripDetails.checkIn}
              onChange={(e) => setTripDetails({ ...tripDetails, checkIn: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
              <Calendar size={12} className="text-treebo-teal" /> Check-out
            </label>
            <input
              type="date"
              className="w-full bg-surface-2 border border-white/10 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:border-treebo-teal/50 transition-colors [color-scheme:dark]"
              value={tripDetails.checkOut}
              onChange={(e) => setTripDetails({ ...tripDetails, checkOut: e.target.value })}
            />
          </div>
        </div>

        {/* Guests & Type */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
              <Users size={12} className="text-treebo-teal" /> Guests
            </label>
            <div className="flex items-center justify-between bg-surface-2 border border-white/10 rounded-xl px-3 py-2.5">
              <button
                onClick={() => setTripDetails({ ...tripDetails, guests: Math.max(1, tripDetails.guests - 1) })}
                className="p-1 hover:bg-white/10 rounded-lg text-treebo-teal transition-colors"
              >
                <Minus size={16} />
              </button>
              <span className="font-bold text-white">{tripDetails.guests}</span>
              <button
                onClick={() => setTripDetails({ ...tripDetails, guests: Math.min(8, tripDetails.guests + 1) })}
                className="p-1 hover:bg-white/10 rounded-lg text-treebo-teal transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
              <Briefcase size={12} className="text-treebo-teal" /> Trip Type
            </label>
            <select
              className="w-full bg-surface-2 border border-white/10 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:border-treebo-teal/50 appearance-none transition-colors"
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
            <label className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Budget per night</label>
            <span className="text-sm font-bold text-treebo-teal bg-treebo-teal/10 px-3 py-1 rounded-lg">₹{tripDetails.budget}</span>
          </div>
          <input
            type="range"
            min="500"
            max="5000"
            step="100"
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-treebo-teal"
            value={tripDetails.budget}
            onChange={(e) => setTripDetails({ ...tripDetails, budget: parseInt(e.target.value) })}
          />
          <div className="flex justify-between text-[10px] text-gray-600 font-bold">
            <span>₹500</span>
            <span>₹5000</span>
          </div>
        </div>

        {/* Vibe */}
        <div className="space-y-3">
          <label className="text-[11px] font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
            <Sparkles size={12} className="text-treebo-teal" /> Trip Vibe
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

        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl flex items-start gap-3 text-sm"
          >
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </motion.div>
        )}

        <button
          onClick={generateTripPlan}
          disabled={isLoading}
          className="w-full bg-gradient-to-r from-treebo-amber to-amber-500 text-treebo-bg font-black py-4 rounded-2xl shadow-lg shadow-treebo-amber/25 transition-all active:scale-95 hover:shadow-treebo-amber/40 flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {isLoading ? (
            <>
              <Loader2 className="animate-spin" size={20} />
              <span>Crafting your trip...</span>
            </>
          ) : (
            <>
              <span>Generate My Trip Plan</span>
              <Sparkles size={20} />
            </>
          )}
        </button>
      </div>
    </div>
  );

  const renderHotelsTab = () => (
    <div className="space-y-6 pb-28">
      <div className="flex justify-between items-center pt-2">
        <h2 className="text-2xl font-display font-bold text-white">Treebo Hotels</h2>
        <div className="text-xs font-bold text-treebo-teal bg-treebo-teal/10 px-3 py-1 rounded-lg flex items-center gap-1.5">
          <MapPin size={11} /> {tripDetails.destination}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        <button className="bg-treebo-teal text-treebo-bg px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap shadow-md shadow-treebo-teal/20">All Hotels</button>
        <button className="bg-surface-2 text-gray-400 border border-white/10 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap hover:text-gray-200 transition-colors">Price: Low to High</button>
        <button className="bg-surface-2 text-gray-400 border border-white/10 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap hover:text-gray-200 transition-colors">Top Rated</button>
      </div>

      <div className="grid grid-cols-1 gap-5">
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
        <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6">
          <div className="w-24 h-24 bg-surface-2 rounded-3xl flex items-center justify-center text-treebo-teal/25 border border-white/5">
            <ClipboardList size={44} />
          </div>
          <div className="space-y-2 max-w-xs">
            <h3 className="text-xl font-display font-bold text-white">No itinerary yet</h3>
            <p className="text-gray-500 text-sm">Complete your trip plan to unlock your personalized itinerary ✨</p>
          </div>
          <button
            onClick={() => setActiveTab('plan')}
            className="bg-treebo-teal text-treebo-bg px-8 py-3 rounded-2xl font-bold shadow-lg shadow-treebo-teal/25 active:scale-95 hover:shadow-treebo-teal/40 transition-all"
          >
            Go to Planner
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-6 pb-28">
        {/* Summary Card */}
        <div className="bg-gradient-to-br from-treebo-teal-dark via-[#0a5c54] to-[#083d37] rounded-3xl p-6 text-white shadow-xl relative overflow-hidden border border-treebo-teal/20">
          <div className="absolute -right-10 -top-10 w-52 h-52 bg-treebo-teal/10 rounded-full blur-3xl" />
          <div className="absolute -left-5 -bottom-10 w-40 h-40 bg-treebo-amber/5 rounded-full blur-3xl" />
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-display font-bold">{generatedPlan.trip_summary?.destination || tripDetails.destination}</h2>
                <p className="text-xs opacity-60 font-medium mt-0.5">{tripDetails.checkIn} — {tripDetails.checkOut}</p>
              </div>
              <div className="bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider border border-white/10">
                {generatedPlan.days?.length || 0} Days
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-5">
              {generatedPlan.trip_summary?.vibe_tags?.map((tag, i) => (
                <span key={i} className="bg-white/10 text-white/70 text-[10px] px-2.5 py-1 rounded-lg border border-white/10">
                  #{tag}
                </span>
              ))}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-white/10">
              <div>
                <p className="text-[10px] opacity-50 uppercase font-bold tracking-wider">Est. Budget</p>
                <p className="text-2xl font-display font-bold">₹{generatedPlan.trip_summary?.total_estimated_cost_inr || 0}</p>
              </div>
              <div className="text-right max-w-[55%]">
                <p className="text-[10px] opacity-50 uppercase font-bold tracking-wider">AI Tip</p>
                <p className="text-xs italic opacity-80 leading-relaxed">"{generatedPlan.trip_summary?.top_tip || 'Enjoy your trip!'}"</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setToast("Itinerary saved to your Treebo account!")}
            className="flex-1 bg-surface-2 border border-white/10 text-gray-300 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95 hover:bg-surface-3 transition-colors"
          >
            <Download size={15} /> Save
          </button>
          <button className="flex-1 bg-surface-2 border border-white/10 text-gray-300 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95 hover:bg-surface-3 transition-colors">
            <Share2 size={15} /> Share
          </button>
        </div>

        {/* Days */}
        <div className="space-y-8">
          {generatedPlan.days?.map((day, idx) => (
            <div key={idx} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-treebo-amber/15 border border-treebo-amber/25 text-treebo-amber flex items-center justify-center font-display font-bold text-base">
                  {day.day}
                </div>
                <h3 className="font-display font-bold text-white">{day.label}</h3>
              </div>

              {['morning', 'afternoon', 'evening'].map((time) => {
                const activities = (day[time as keyof DayPlan] as Activity[]) || [];
                return (
                  <div key={time} className="space-y-3 relative pl-5 border-l-2 border-dashed border-white/10 ml-5">
                    <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-treebo-bg border-2 border-treebo-teal shadow-sm shadow-treebo-teal/30" />
                    <h4 className="text-[10px] uppercase font-black text-gray-600 tracking-widest mb-2">{time}</h4>
                    {activities.map((act, i) => (
                      <div key={i} className="bg-surface-2 p-4 rounded-2xl border border-white/[0.06] space-y-2">
                        <div className="flex justify-between items-start">
                          <div className="flex gap-2">
                            <span className="text-xl">{act.emoji}</span>
                            <div>
                              <h5 className="font-bold text-sm text-white">{act.name}</h5>
                              <p className="text-xs text-gray-500 line-clamp-1">{act.description}</p>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-treebo-teal bg-treebo-teal/10 px-2 py-0.5 rounded-lg flex-shrink-0 ml-2">₹{act.cost_inr}</span>
                        </div>
                        <div className="flex items-center gap-4 text-[10px] font-bold text-gray-600">
                          <div className="flex items-center gap-1">
                            <Clock size={11} /> {act.duration_hours}h
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin size={11} /> {act.distance_from_hotel_km}km
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
                className="bg-treebo-amber/10 border border-treebo-amber/20 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:bg-treebo-amber/15 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-treebo-amber/15 border border-treebo-amber/25 flex items-center justify-center">
                    <Hotel size={18} className="text-treebo-amber" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-treebo-amber/60">Stay Tonight</p>
                    <p className="text-sm font-bold text-white">{filteredHotels[0]?.name || "Treebo Trend Hotel"}</p>
                  </div>
                </div>
                <ArrowRight size={18} className="text-treebo-amber/50" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderChatTab = () => (
    <div className="flex flex-col h-[calc(100vh-180px)] pb-28">
      <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 p-2">
        {chatHistory.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
            <div className="w-16 h-16 bg-treebo-teal/10 border border-treebo-teal/20 rounded-3xl flex items-center justify-center">
              <Sparkles size={28} className="text-treebo-teal" />
            </div>
            <div className="space-y-1">
              <h3 className="font-display font-bold text-white text-lg">Treebo AI Assistant</h3>
              <p className="text-xs text-gray-500">Ask me anything about your trip!</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 max-w-xs">
              {["What should I pack?", "Best local food?", "Is it safe solo?", "Weekend activities"].map(prompt => (
                <button
                  key={prompt}
                  onClick={() => handleSendMessage(prompt)}
                  className="bg-surface-2 border border-white/10 text-gray-400 px-4 py-2 rounded-xl text-xs font-medium hover:border-treebo-teal/30 hover:text-gray-200 transition-colors"
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
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[82%] p-4 rounded-2xl text-sm ${
              msg.role === 'user'
                ? 'bg-treebo-teal text-treebo-bg font-medium rounded-tr-sm'
                : 'bg-surface-2 text-gray-100 border border-white/[0.06] rounded-tl-sm flex gap-3'
            }`}>
              {msg.role === 'model' && (
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-treebo-teal to-treebo-teal-dark flex-shrink-0 flex items-center justify-center text-treebo-bg text-[10px] font-black shadow-sm">
                  T
                </div>
              )}
              {msg.role === 'model' ? (
                <div
                  className="prose prose-sm max-w-none [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-1 [&_li]:mb-1 [&_p]:mb-1 [&_strong]:font-semibold [&_strong]:text-white"
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
            <div className="bg-surface-2 p-4 rounded-2xl rounded-tl-sm border border-white/[0.06] flex gap-2 items-center">
              <div className="w-1.5 h-1.5 bg-treebo-teal/50 rounded-full animate-bounce" />
              <div className="w-1.5 h-1.5 bg-treebo-teal/50 rounded-full animate-bounce [animation-delay:0.2s]" />
              <div className="w-1.5 h-1.5 bg-treebo-teal/50 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="fixed bottom-20 left-0 right-0 px-4 py-3 bg-treebo-bg/90 backdrop-blur-xl border-t border-white/[0.06] max-w-[430px] mx-auto">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Ask Treebo AI..."
            className="flex-1 bg-surface-2 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-treebo-teal/40 transition-colors"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          />
          <button
            onClick={() => handleSendMessage()}
            className="bg-treebo-teal text-treebo-bg p-3 rounded-2xl shadow-lg shadow-treebo-teal/25 active:scale-90 transition-all hover:shadow-treebo-teal/40"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-treebo-bg flex justify-center">
      <div className="w-full max-w-[430px] bg-treebo-bg min-h-screen relative shadow-2xl shadow-black/50 flex flex-col">
        <Header />

        <main className="flex-1 pt-24 px-5 overflow-y-auto no-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
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
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[100] bg-surface-3 border border-white/10 text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-2xl shadow-black/50 flex items-center gap-2 whitespace-nowrap backdrop-blur-xl"
            >
              <CheckCircle2 size={16} className="text-treebo-teal" />
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
