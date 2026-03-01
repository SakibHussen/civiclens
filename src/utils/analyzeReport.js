// Severity multipliers — applied on top of Gemini's baseSeverity
const SEVERITY_MULTIPLIERS = {
  gas_leak:              1.8,
  chemical_spill:        1.8,
  downed_power_line:     1.8,
  biohazard:             1.5,
  fire_hazard:           1.5,
  sewer_overflow:        1.5,
  water_main_break:      1.5,
  flooding:              1.4,
  electrical_hazard:     1.4,
  structural_fire_damage:1.4,
  traffic_light_malfunction: 1.3,
  burst_pipe:            1.3,
  sinkholes:             1.3,
};

const SEVERITY_LEVELS = [
  { min: 8, max: 10, level: "critical" },
  { min: 6, max: 7,  level: "high"     },
  { min: 4, max: 5,  level: "medium"   },
  { min: 1, max: 3,  level: "low"      },
];

// Fallback department assignment based on issueType in case Gemini misses it
const DEPT_MAP = {
  // Fire
  biohazard: "fire", fire_hazard: "fire", chemical_spill: "fire",
  gas_leak: "fire", smoke_odor: "fire", abandoned_fire: "fire",
  hazardous_material: "fire", structural_fire_damage: "fire",
  fallen_tree_blocking_road: "fire",
  // Water
  flooding: "water", water_leakage: "water", burst_pipe: "water",
  drainage_blockage: "water", sewer_overflow: "water", manhole_overflow: "water",
  water_main_break: "water", contaminated_water: "water", standing_water: "water",
  storm_drain_blockage: "water", sinkholes: "water", water_pressure_issue: "water",
  // Electric / Public Works
  electrical_hazard: "electric", broken_streetlight: "electric",
  downed_power_line: "electric", pothole: "electric", road_damage: "electric",
  broken_infrastructure: "electric", traffic_light_malfunction: "electric",
  damaged_guardrail: "electric", road_sign_damage: "electric",
  sidewalk_damage: "electric", bridge_damage: "electric", exposed_wiring: "electric",
  transformer_issue: "electric", road_cave_in: "electric",
  construction_hazard: "electric", debris_on_road: "electric",
};

const DEFAULT_RESULT = {
  issueType:          "road_damage",
  assignedDepartment: "electric",
  summary:            "Civic issue reported by a citizen.",
  caseDescription:    "A civic issue was reported. Manual review is required.",
  severityScore:      5,
  severityLevel:      "medium",
  urgency:            "medium",
};

function buildPrompt(description, location) {
  return `You are a civic infrastructure AI. Analyze this image and any description provided. Identify the issue and respond ONLY in JSON.

Issue types and their departments:

FIRE DEPARTMENT: biohazard, fire_hazard, chemical_spill, gas_leak, smoke_odor, abandoned_fire, hazardous_material, structural_fire_damage, fallen_tree_blocking_road

WATER AUTHORITY: flooding, water_leakage, burst_pipe, drainage_blockage, sewer_overflow, manhole_overflow, water_main_break, contaminated_water, standing_water, storm_drain_blockage, sinkholes, water_pressure_issue

PUBLIC WORKS: electrical_hazard, broken_streetlight, downed_power_line, pothole, road_damage, broken_infrastructure, traffic_light_malfunction, damaged_guardrail, road_sign_damage, sidewalk_damage, bridge_damage, exposed_wiring, transformer_issue, road_cave_in, construction_hazard, debris_on_road

${description ? `Citizen description: ${description}` : "No description provided — analyze the image only."}
${location ? `Location: ${location}` : ""}

Score across 5 dimensions (0-10):
1. SAFETY_RISK: Immediate danger to human life
2. SPREAD_RISK: Deterioration rate without intervention
3. POPULATION_IMPACT: Number of people affected
4. INFRASTRUCTURE_CRITICALITY: Importance of the affected system
5. ENVIRONMENTAL_RISK: Contamination or environmental damage potential

Respond ONLY with this JSON (no markdown, no backticks):
{
  "issueType": "<pick the single closest match from the lists above>",
  "assignedDepartment": "<fire | water | electric>",
  "summary": "<1 sentence, public-friendly description of what you see>",
  "caseDescription": "<2-3 sentences, technical description for city administrators>",
  "urgency": "<immediate | high | medium | low>",
  "dimensions": {
    "safety_risk": <number 0-10>,
    "spread_risk": <number 0-10>,
    "population_impact": <number 0-10>,
    "infrastructure_criticality": <number 0-10>,
    "environmental_risk": <number 0-10>
  },
  "reasoning": "<1-2 sentences explaining the scores>"
}`;}

export async function analyzeReport({ imageBase64, description, location }) {
  console.log("[analyzeReport] Starting — hasImage:", !!imageBase64, "| description:", description || "(none)", "| location:", location || "(none)");
  try {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const parts = [];
    if (imageBase64) {
      parts.push({ inlineData: { mimeType: "image/jpeg", data: imageBase64 } });
    }
    parts.push({ text: buildPrompt(description, location) });

    const response = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ contents: [{ parts }] }),
    });

    console.log("[analyzeReport] API response status:", response.status, response.statusText);

    if (!response.ok) {
      const errBody = await response.text();
      console.error("[analyzeReport] API error body:", errBody);
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data    = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log("[analyzeReport] Raw response text:", rawText);

    if (!rawText) throw new Error("No text in Gemini response");

    // Strip possible markdown code fences
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed  = JSON.parse(cleaned);

    const { issueType, assignedDepartment, summary, caseDescription, urgency, dimensions, reasoning } = parsed;

    if (!issueType || !summary || !caseDescription || !dimensions) {
      throw new Error("Missing required fields in Gemini response");
    }

    // Weighted score from 5 dimensions
    const {
      safety_risk = 0, spread_risk = 0, population_impact = 0,
      infrastructure_criticality = 0, environmental_risk = 0,
    } = dimensions;
    const weightedBase = (
      safety_risk             * 0.35 +
      spread_risk             * 0.20 +
      population_impact       * 0.25 +
      infrastructure_criticality * 0.10 +
      environmental_risk      * 0.10
    );
    const multiplier    = SEVERITY_MULTIPLIERS[issueType] ?? 1.0;
    const severityScore = Math.min(10, Math.round(weightedBase * multiplier));
    const severityLevel = SEVERITY_LEVELS.find(
      (t) => severityScore >= t.min && severityScore <= t.max
    )?.level ?? "low";

    // Use Gemini's assignedDepartment, fall back to DEPT_MAP, then "electric"
    // Normalize the department key to handle variations like "fire department", "water authority", "public works", etc.
    let dept = assignedDepartment?.toLowerCase() ?? "";
    if (dept.includes("fire") || dept.includes("🚒")) {
      dept = "fire";
    } else if (dept.includes("water") || dept.includes("💧")) {
      dept = "water";
    } else if (dept.includes("electric") || dept.includes("public work") || dept.includes("⚡")) {
      dept = "electric";
    } else {
      dept = DEPT_MAP[issueType] ?? "electric";
    }

    const result = {
      issueType,
      assignedDepartment: dept,
      summary,
      caseDescription,
      severityScore,
      severityLevel,
      urgency:    urgency    ?? "medium",
      dimensions,
      reasoning:  reasoning  ?? null,
    };
    console.log("[analyzeReport] Success:", result);
    return result;
  } catch (err) {
    console.error("[analyzeReport] Failed — returning DEFAULT_RESULT. Reason:", err);
    return DEFAULT_RESULT;
  }
}
