export async function testGeminiAPI() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey || apiKey === "your-gemini-api-key-here") {
    return "ERROR: VITE_GEMINI_API_KEY is missing. Add it to civiclens/.env and restart the dev server.";
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const body = {
    contents: [{
      parts: [{ text: "Say hello and confirm you are working. Reply in one sentence." }]
    }]
  };

  console.log("[testGemini] Sending request to Gemini...");

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  console.log("[testGemini] Status:", response.status, response.statusText);

  const data = await response.json();
  console.log("[testGemini] Full response:", data);

  if (!response.ok) {
    return `ERROR ${response.status}: ${data?.error?.message ?? response.statusText}`;
  }

  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "No text in response";
}
