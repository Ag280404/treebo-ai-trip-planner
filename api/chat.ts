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

  // Try Gemini first
  try {
    const ai = new GoogleGenAI({ apiKey });

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
  } catch (geminiErr: any) {
    console.warn('Gemini chat failed:', geminiErr?.message);

    const isRateLimit = geminiErr?.message?.includes('429') || geminiErr?.message?.includes('RESOURCE_EXHAUSTED');
    const isOverloaded = geminiErr?.message?.includes('503') || geminiErr?.message?.includes('UNAVAILABLE');

    // Fall back to OpenRouter if rate-limited or overloaded
    if ((isRateLimit || isOverloaded) && process.env.OPENROUTER_API_KEY) {
      try {
        const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'https://treebo-ai-trip-planner.vercel.app',
            'X-Title': 'Treebo AI Trip Planner',
          },
          body: JSON.stringify({
            model: 'meta-llama/llama-3.3-8b-instruct:free',
            messages: [
              { role: 'system', content: systemInstruction },
              ...(history || []).map((m: { role: string; content: string }) => ({
                role: m.role === 'model' ? 'assistant' : m.role,
                content: m.content,
              })),
              { role: 'user', content: message },
            ],
            max_tokens: 300,
            temperature: 0.7,
          }),
        });

        if (!orRes.ok) {
          const orErr = await orRes.json().catch(() => ({}));
          throw new Error(orErr?.error?.message || `OpenRouter error: ${orRes.status}`);
        }

        const orData = await orRes.json();
        const reply = orData.choices?.[0]?.message?.content || "I'm sorry, I couldn't process that.";
        return res.status(200).json({ reply });
      } catch (orErr: any) {
        console.error('OpenRouter chat fallback failed:', orErr?.message);
      }
    }

    // Return friendly error
    if (isRateLimit) {
      return res.status(429).json({ error: 'AI quota reached. Please try again in a minute.' });
    }
    if (isOverloaded) {
      return res.status(503).json({ error: 'AI is currently busy. Please try again in a moment.' });
    }
    return res.status(500).json({ error: 'Failed to get a response. Please try again.' });
  }
}
