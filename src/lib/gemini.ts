// src/lib/Gemini.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = import.meta.env.VITE_GOOGLE_AI_API_KEY || '';

let genAI: GoogleGenerativeAI | null = null;

// Initialize only if API key is available
if (API_KEY) {
  genAI = new GoogleGenerativeAI(API_KEY);
}

/**
 * Enriches lot data using AI to generate descriptions and additional information
 */
export async function enrichLotData(lotData: {
  name?: string;
  description?: string;
  category?: string;
  materials?: string;
  creator?: string;
  origin?: string;
  condition?: string;
  style?: string;
  [key: string]: any;
}): Promise<{
  enrichedDescription?: string;
  suggestedCategory?: string;
  estimatedPeriod?: string;
  keywords?: string[];
  condition?: string;
  error?: string;
}> {
  if (!genAI) {
    console.warn('Gemini AI not configured. Add VITE_GOOGLE_AI_API_KEY to use AI features.');
    return {
      error: 'AI features not configured',
    };
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    // Build a comprehensive prompt from available lot data
    const prompt = `You are an expert art and antiques appraiser. Analyze this lot information and provide enriched details:

Lot Name: ${lotData.name || 'Not provided'}
Current Description: ${lotData.description || 'Not provided'}
Category: ${lotData.category || 'Not provided'}
Materials: ${lotData.materials || 'Not provided'}
Creator/Artist: ${lotData.creator || 'Not provided'}
Origin: ${lotData.origin || 'Not provided'}
Condition: ${lotData.condition || 'Not provided'}
Style: ${lotData.style || 'Not provided'}

Please provide:
1. An enriched, professional description (2-3 sentences)
2. Suggested category (if current one is vague)
3. Estimated time period or era
4. 3-5 relevant keywords for cataloging
5. Brief condition assessment if not provided

Format your response as JSON with keys: enrichedDescription, suggestedCategory, estimatedPeriod, keywords (array), conditionNotes`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Try to parse the JSON response
    try {
      const parsed = JSON.parse(text);
      return parsed;
    } catch {
      // If not valid JSON, return the text as enriched description
      return {
        enrichedDescription: text,
      };
    }
  } catch (error) {
    console.error('Gemini API error in enrichLotData:', error);
    return {
      error: 'Failed to enrich lot data. Please try again.',
    };
  }
}

/**
 * Generates a description from a text prompt
 */
export async function generateDescription(prompt: string): Promise<string> {
  if (!genAI) {
    return 'AI features not configured. Please add VITE_GOOGLE_AI_API_KEY to your environment variables.';
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini API error:', error);
    return 'Failed to generate AI description. Please try again.';
  }
}

/**
 * Analyzes an image and generates insights
 */
export async function analyzeImage(
  imageData: string,
  prompt: string = 'Describe this item in detail for an auction catalog.'
): Promise<string> {
  if (!genAI) {
    return 'AI features not configured. Please add VITE_GOOGLE_AI_API_KEY to your environment variables.';
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro-vision' });

    const imageParts = [
      {
        inlineData: {
          data: imageData.includes(',') ? imageData.split(',')[1] : imageData,
          mimeType: imageData.includes('png') ? 'image/png' : 'image/jpeg',
        },
      },
    ];

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini Vision API error:', error);
    return 'Failed to analyze image. Please try again.';
  }
}

/**
 * Generates catalog-style descriptions for auction lots
 */
export async function generateCatalogDescription(lotInfo: {
  name: string;
  creator?: string;
  materials?: string;
  dimensions?: string;
  condition?: string;
  provenance?: string;
}): Promise<string> {
  if (!genAI) {
    return 'AI features not configured.';
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `Write a professional auction catalog description for:
    
Title: ${lotInfo.name}
${lotInfo.creator ? `Artist/Creator: ${lotInfo.creator}` : ''}
${lotInfo.materials ? `Materials: ${lotInfo.materials}` : ''}
${lotInfo.dimensions ? `Dimensions: ${lotInfo.dimensions}` : ''}
${lotInfo.condition ? `Condition: ${lotInfo.condition}` : ''}
${lotInfo.provenance ? `Provenance: ${lotInfo.provenance}` : ''}

Write a concise, professional description suitable for an auction catalog (3-4 sentences). Focus on key features, craftsmanship, and appeal to collectors.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini API error:', error);
    return 'Failed to generate catalog description.';
  }
}

export const geminiEnabled = !!genAI;