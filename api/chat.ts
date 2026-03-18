import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from "@google/genai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, history, tripContext } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Missing required field: message' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: missing API key' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const { destination, checkIn, checkOut, budget } = tripContext || {};

    const chat = ai.chats.create({
      model: "gemini-2.5-flash",
      history: (history || []).map((m: { role: string; content: string }) => ({
        role: m.role,
        parts: [{ text: m.content }]
      })),
      config: {
        systemInstruction: `You are Treebo's friendly travel assistant. The user is planning a trip to ${destination || 'their destination'} from ${checkIn || 'their check-in date'} to ${checkOut || 'their check-out date'}. They are interested in a Treebo hotel (budget: ₹${budget || 2500}/night). Be concise, warm, practical. Mention Treebo hotel amenities (Free WiFi, AC, Breakfast, Assured quality) where relevant. Never recommend competitor hotels.`,
      }
    });

    const response = await chat.sendMessage({ message });
    const reply = response.text || "I'm sorry, I couldn't process that.";

    return res.status(200).json({ reply });
  } catch (err: any) {
    console.error('chat error:', err);
    const isOverloaded = err?.message?.includes('503') || err?.message?.includes('UNAVAILABLE');
    if (isOverloaded) {
      return res.status(503).json({ error: 'AI is currently busy. Please try again in a moment.' });
    }
    return res.status(500).json({ error: err?.message || 'Failed to get chat response' });
  }
}
