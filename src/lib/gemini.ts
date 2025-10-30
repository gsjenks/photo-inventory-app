import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

if (!apiKey) {
  console.warn('Gemini API key not configured. Please set VITE_GEMINI_API_KEY in your .env file.');
}

export const genAI = new GoogleGenerativeAI(apiKey);

// Initialize the model
export const getModel = () => {
  return genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
};

// Helper function for AI search
export async function aiSearch(query: string, inventory: any[]): Promise<any[]> {
  try {
    const model = getModel();
    
    const prompt = `You are an inventory search assistant. Given this search query: "${query}"
    
And this inventory data: ${JSON.stringify(inventory, null, 2)}

Return ONLY a JSON array of IDs for items that match the query. Consider:
- Item names and descriptions
- Categories, styles, origins
- Materials and techniques
- Creators and provenance
- Natural language understanding (e.g., "french chairs" should match items with origin="France" and category="Chair")

Return format: ["id1", "id2", "id3"]`;

    const result = await model.generateContent(prompt);
    const response = result.response.text();
    
    // Parse the JSON response
    const matchedIds = JSON.parse(response.replace(/```json\n?|\n?```/g, ''));
    return inventory.filter(item => matchedIds.includes(item.id));
  } catch (error) {
    console.error('AI search error:', error);
    return [];
  }
}

// Helper function for AI data enrichment
export async function enrichLotData(photos: string[], existingData: any = {}): Promise<any> {
  try {
    const model = getModel();
    
    const prompt = `Analyze these item photos and provide detailed catalog information.

Current data: ${JSON.stringify(existingData, null, 2)}

Please provide:
1. A catalog-ready title (concise, professional)
2. A detailed description including condition report
3. Condition assessment (Excellent, Good, Fair, Poor)
4. Category (e.g., Furniture, Art, Jewelry, etc.)
5. Style/Period (e.g., Victorian, Art Deco, Contemporary)
6. Origin/Country
7. Possible creator/maker (if identifiable)
8. Materials and techniques
9. Estimated market value range (in USD)
10. Suggested starting bid
11. Approximate dimensions (if visible, use common objects for scale)

Return ONLY valid JSON in this format:
{
  "title": "string",
  "description": "string",
  "condition": "string",
  "category": "string",
  "style": "string",
  "origin": "string",
  "creator": "string or null",
  "materials": "string",
  "estimate_low": number,
  "estimate_high": number,
  "starting_bid": number,
  "height": number or null,
  "width": number or null,
  "depth": number or null,
  "weight": number or null
}`;

    const result = await model.generateContent([prompt, ...photos.map(url => ({ inlineData: { data: url.split(',')[1], mimeType: 'image/jpeg' } }))]);
    const response = result.response.text();
    
    // Parse the JSON response
    const enrichedData = JSON.parse(response.replace(/```json\n?|\n?```/g, ''));
    return enrichedData;
  } catch (error) {
    console.error('AI enrichment error:', error);
    throw error;
  }
}

// Helper function for AI photo editing
export async function editPhoto(imageData: string, prompt: string): Promise<string> {
  try {
    // Note: Gemini doesn't directly edit images, but can provide instructions
    // In a production app, you'd use an image editing API here
    console.log('Photo editing with prompt:', prompt);
    // Return original for now - would integrate with actual image editing service
    return imageData;
  } catch (error) {
    console.error('Photo editing error:', error);
    throw error;
  }
}
