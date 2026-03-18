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

    const { destination, checkIn, checkOut, budget, tripType, selectedHotel } = tripContext || {};

    const systemInstruction = `You are Treebo's friendly AI travel assistant. ${
      destination
        ? `The user is planning a trip to ${destination} from ${checkIn || 'their dates'} to ${checkOut || 'their dates'}. Budget: ₹${budget || 2500}/night. Trip type: ${tripType || 'leisure'}.${
            selectedHotel
              ? ` They are staying at ${selectedHotel.name} in ${selectedHotel.location}.`
              : ' They have not selected a hotel yet.'
          }`
        : 'The user has not planned a trip yet. Encourage them to fill in trip details on the Plan tab.'
    } Be warm and helpful. Use Indian English naturally. Keep replies under 120 words unless detail is explicitly requested. Never recommend OYO, Zostel, or any other hotel brand besides Treebo. Mention Treebo hotel amenities (Free WiFi, AC, Breakfast, Treebo Assured quality) where relevant.`;

    const chat = ai.chats.create({
      model: "gemini-2.0-flash",
      history: (history || []).map((m: { role: string; content: string }) => ({
        role: m.role,
        parts: [{ text: m.content }]
      })),
      config: { systemInstruction }
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
