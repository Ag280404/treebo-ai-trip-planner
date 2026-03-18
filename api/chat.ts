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

  // Build conversation contents for generateContent (same API that trip generation uses — proven to work)
  const contents = [
    ...(history || []).map((m: { role: string; content: string }) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];

  // Try OpenRouter first (free tier, no quota issues)
  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey) {
    try {
      const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${orKey}`,
          'HTTP-Referer': 'https://treebo-ai-trip-planner.vercel.app',
          'X-Title': 'Treebo AI Trip Planner',
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.3-8b-instruct:free',
          messages: [
            { role: 'system', content: systemInstruction },
            ...(history || []).map((m: { role: string; content: string }) => ({
              role: m.role === 'model' ? 'assistant' : 'user',
              content: m.content,
            })),
            { role: 'user', content: message },
          ],
          max_tokens: 300,
          temperature: 0.7,
        }),
      });

      if (orRes.ok) {
        const orData = await orRes.json();
        const reply = orData.choices?.[0]?.message?.content?.trim();
        if (reply) {
          console.log('[chat] OpenRouter success');
          return res.status(200).json({ reply });
        }
      }
      console.warn('[chat] OpenRouter non-ok or empty:', orRes.status);
    } catch (orErr: any) {
      console.warn('[chat] OpenRouter failed:', orErr?.message);
    }
  }

  // Fall back to Gemini — use generateContent (same as generate-trip, proven stable)
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents,
        config: { systemInstruction },
      });
      const reply = response.text?.trim() || "I'm sorry, I couldn't process that.";
      console.log('[chat] Gemini success');
      return res.status(200).json({ reply });
    } catch (geminiErr: any) {
      console.warn('[chat] Gemini failed:', geminiErr?.message);
    }
  }

  return res.status(503).json({ error: 'AI is currently unavailable. Please try again in a moment.' });
}
