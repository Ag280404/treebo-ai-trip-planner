import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from "@google/genai";

const SCHEMA = {
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
          morning: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                emoji: { type: Type.STRING },
                description: { type: Type.STRING },
                duration_hours: { type: Type.NUMBER },
                cost_inr: { type: Type.NUMBER },
                distance_from_hotel_km: { type: Type.NUMBER }
              }
            }
          },
          afternoon: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                emoji: { type: Type.STRING },
                description: { type: Type.STRING },
                duration_hours: { type: Type.NUMBER },
                cost_inr: { type: Type.NUMBER },
                distance_from_hotel_km: { type: Type.NUMBER }
              }
            }
          },
          evening: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                emoji: { type: Type.STRING },
                description: { type: Type.STRING },
                duration_hours: { type: Type.NUMBER },
                cost_inr: { type: Type.NUMBER },
                distance_from_hotel_km: { type: Type.NUMBER }
              }
            }
          }
        }
      }
    }
  }
};

async function callGemini(ai: GoogleGenAI, model: string, prompt: string) {
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction: `You are Treebo's AI Trip Planner. Generate a concise day-by-day itinerary. Each day has morning (2 activities), afternoon (2 activities), evening (1-2 activities). Keep descriptions short (under 15 words). Be specific to the destination. Return valid JSON only.`,
      responseMimeType: "application/json",
      responseSchema: SCHEMA,
    }
  });
  return response;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { destination, guests, tripType, budget, vibe, checkIn, checkOut } = req.body;

  if (!destination || !checkIn || !checkOut) {
    return res.status(400).json({ error: 'Missing required fields: destination, checkIn, checkOut' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: missing API key' });
  }

  const ai = new GoogleGenAI({ apiKey });

  // Cap at 5 days to keep responses fast
  const msPerDay = 24 * 60 * 60 * 1000;
  const totalDays = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / msPerDay);
  const planDays = Math.min(totalDays || 3, 5);

  const prompt = `Plan a ${planDays}-day trip to ${destination} for ${guests} ${tripType} traveler(s). Budget per night: ₹${budget}. Vibe: ${(vibe || []).join(', ')}. Dates: ${checkIn} to ${checkOut}. Generate exactly ${planDays} days. Keep each activity description under 15 words.`;

  // Gemini model fallback chain — 1.5 models are deprecated, use 2.x only
  const geminiModels = ['gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'];

  for (let i = 0; i < geminiModels.length; i++) {
    const model = geminiModels[i];
    try {
      const response = await callGemini(ai, model, prompt);
      let text = response.text || '{}';
      text = text.replace(/```json\n?/, '').replace(/```\n?/, '').trim();
      const plan = JSON.parse(text);
      console.log(`[generate-trip] Success with Gemini model: ${model}`);
      return res.status(200).json(plan);
    } catch (err: any) {
      const status = err?.status || err?.code;
      const isOverloaded = status === 503 || status === 429 ||
        err?.message?.includes('503') || err?.message?.includes('UNAVAILABLE') || err?.message?.includes('429');
      console.error(`[generate-trip] ${model} failed:`, status, err?.message);

      if (!isOverloaded) break; // non-transient — skip to Groq
      if (i < geminiModels.length - 1) await new Promise(r => setTimeout(r, 1500));
    }
  }

  // Final fallback: Groq (free, fast, OpenAI-compatible)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      console.log('[generate-trip] Trying Groq fallback...');
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: `You are Treebo's AI Trip Planner. Generate a concise day-by-day itinerary as valid JSON only (no markdown). Each day has morning (2 activities), afternoon (2 activities), evening (1-2 activities). Keep descriptions under 15 words. Return JSON matching exactly this structure: { "trip_summary": { "destination": string, "total_estimated_cost_inr": number, "top_tip": string, "vibe_tags": string[] }, "days": [{ "day": number, "label": string, "morning": [{ "name": string, "emoji": string, "description": string, "duration_hours": number, "cost_inr": number, "distance_from_hotel_km": number }], "afternoon": [...same...], "evening": [...same...] }] }`
            },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          response_format: { type: 'json_object' }
        })
      });
      const groqData = await groqRes.json() as any;
      const text = groqData.choices?.[0]?.message?.content || '{}';
      const plan = JSON.parse(text);
      console.log('[generate-trip] Success with Groq fallback');
      return res.status(200).json(plan);
    } catch (err: any) {
      console.error('[generate-trip] Groq fallback failed:', err?.message);
    }
  }

  return res.status(503).json({ error: 'AI services are currently busy. Please try again in a moment.' });
}
