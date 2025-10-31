// lib/gemini.ts - Complete Gemini integration with photo and lot enrichment

// Photo enrichment types
export interface PhotoEnrichmentResult {
  description: string;
  tags: string[];
  colors: string[];
  objects: string[];
}

// Enrich a single photo with AI-generated metadata
export async function enrichPhotoMetadata(imageUrl: string): Promise<PhotoEnrichmentResult> {
  try {
    // Fetch the image and convert to base64
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const base64 = await blobToBase64(blob);
    
    // Call Gemini AI vision service
    const aiResponse = await callAIVisionService(base64);
    
    return {
      description: aiResponse.description || '',
      tags: aiResponse.tags || [],
      colors: aiResponse.colors || [],
      objects: aiResponse.objects || [],
    };
  } catch (error) {
    console.error('Error enriching photo metadata:', error);
    throw error;
  }
}

// Convert blob to base64
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      resolve(base64.split(',')[1]); // Remove data:image/jpeg;base64, prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Call Gemini AI vision service for photo analysis
async function callAIVisionService(base64Image: string): Promise<any> {
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!GEMINI_API_KEY) {
    throw new Error('VITE_GEMINI_API_KEY is not set in environment variables');
  }
  
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: `Analyze this auction item photo and provide:
1. A detailed description of the item (2-3 sentences)
2. A list of 5-10 relevant tags/keywords
3. The 3-5 dominant colors in the image
4. A list of objects/items visible in the photo

Format your response as JSON with keys: description, tags (array), colors (array), objects (array)

Example format:
{
  "description": "A detailed description here",
  "tags": ["tag1", "tag2", "tag3"],
  "colors": ["blue", "gold", "white"],
  "objects": ["vase", "table", "flowers"]
}`
            },
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: base64Image
              }
            }
          ]
        }]
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  if (!data.candidates || data.candidates.length === 0) {
    throw new Error('No response from Gemini API');
  }
  
  const text = data.candidates[0].content.parts[0].text;
  
  // Parse the JSON response from the AI
  try {
    // Remove markdown code blocks if present
    const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        description: parsed.description || text,
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        colors: Array.isArray(parsed.colors) ? parsed.colors : [],
        objects: Array.isArray(parsed.objects) ? parsed.objects : []
      };
    }
  } catch (e) {
    console.error('Error parsing AI response:', e);
  }
  
  // Fallback response - try to extract useful info from plain text
  return {
    description: text,
    tags: [],
    colors: [],
    objects: []
  };
}

// Lot enrichment types
export interface LotEnrichmentResult {
  description?: string;
  category?: string;
  style?: string;
  origin?: string;
  creator?: string;
  materials?: string;
  condition?: string;
  estimate_low?: number;
  estimate_high?: number;
}

// Enrich lot data based on photos
export async function enrichLotData(photoUrls: string[]): Promise<LotEnrichmentResult> {
  try {
    if (photoUrls.length === 0) {
      throw new Error('No photos provided for enrichment');
    }

    // Use the first photo for lot-level enrichment
    const primaryPhotoUrl = photoUrls[0];
    
    const response = await fetch(primaryPhotoUrl);
    const blob = await response.blob();
    const base64 = await blobToBase64(blob);
    
    const aiResponse = await callLotEnrichmentService(base64);
    
    return aiResponse;
  } catch (error) {
    console.error('Error enriching lot data:', error);
    throw error;
  }
}

// Call Gemini AI for lot-level enrichment
async function callLotEnrichmentService(base64Image: string): Promise<LotEnrichmentResult> {
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!GEMINI_API_KEY) {
    throw new Error('VITE_GEMINI_API_KEY is not set in environment variables');
  }
  
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: `Analyze this auction item and provide detailed information:

1. Description: A comprehensive description (3-5 sentences) of the item
2. Category: The item category (e.g., "Furniture", "Art", "Jewelry", "Collectibles")
3. Style: The artistic/design style (e.g., "Victorian", "Mid-Century Modern", "Art Deco")
4. Origin: Country or region of origin
5. Creator: Artist, manufacturer, or maker (if identifiable)
6. Materials: Primary materials used (e.g., "Oak wood", "Sterling silver", "Oil on canvas")
7. Condition: Overall condition assessment (e.g., "Excellent", "Good", "Fair", "Poor")
8. Estimate: Estimated auction value range in USD (low and high)

Format your response as JSON:
{
  "description": "detailed description",
  "category": "category name",
  "style": "style/period",
  "origin": "country/region",
  "creator": "maker name or Unknown",
  "materials": "primary materials",
  "condition": "condition assessment",
  "estimate_low": 100,
  "estimate_high": 500
}`
            },
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: base64Image
              }
            }
          ]
        }]
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  if (!data.candidates || data.candidates.length === 0) {
    throw new Error('No response from Gemini API');
  }
  
  const text = data.candidates[0].content.parts[0].text;
  
  // Parse the JSON response
  try {
    const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        description: parsed.description || undefined,
        category: parsed.category || undefined,
        style: parsed.style || undefined,
        origin: parsed.origin || undefined,
        creator: parsed.creator !== 'Unknown' ? parsed.creator : undefined,
        materials: parsed.materials || undefined,
        condition: parsed.condition || undefined,
        estimate_low: parsed.estimate_low ? Number(parsed.estimate_low) : undefined,
        estimate_high: parsed.estimate_high ? Number(parsed.estimate_high) : undefined,
      };
    }
  } catch (e) {
    console.error('Error parsing lot enrichment response:', e);
  }
  
  // Fallback - return description only
  return {
    description: text
  };
}

// Export all functions and types
export default {
  enrichPhotoMetadata,
  enrichLotData,
};