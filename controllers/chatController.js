const db = require('../config/db');
let chatHistories = {};

// Ensure Supabase has all needed columns
async function ensureColumnsExist() {
  const requiredCols = {
    disease: 'TEXT',
    on_medications: 'TEXT',
    medical_history: 'TEXT',
    vitals: 'TEXT',
    allergies: 'TEXT',
    professional: 'TEXT',
  };

  const res = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'patient';
  `);

  const existingCols = res.rows.map(row => row.column_name);

  for (const [col, type] of Object.entries(requiredCols)) {
    if (!existingCols.includes(col)) {
      console.log(`🧱 Adding missing column: ${col}`);
      await db.query(`ALTER TABLE patient ADD COLUMN ${col} ${type};`);
    }
  }
}

// ✅ POST /chat
exports.handleChatMessage = async (req, res) => {
  const { message: userMessage, symptoms = [], context = "initial", patientId } = req.body;
  console.log("🟡 Incoming Request:", { patientId, userMessage, symptoms, context });

  if (!patientId) {
    console.warn("⚠️ patientId missing");
    return res.status(400).json({ error: "patientId is required" });
  }

  if (!chatHistories[patientId]) chatHistories[patientId] = [];
  let chatHistory = chatHistories[patientId];

  let input = null;
  if (context === "symptoms") {
    input = symptoms && symptoms.length > 0 ? `Symptoms: ${symptoms.join(", ")}` : null;
  } else if (context === "feedback") {
    input = userMessage ? `Feedback: ${userMessage}` : null;
  } else if (context === "initial") {
    input = userMessage ? `Concern: ${userMessage}` : null;
  }

  if (!input) {
    console.warn("⚠️ Invalid or missing input.");
    return res.status(400).json({ reply: "Please provide a valid health concern or symptoms." });
  }

  // Reset chat if feedback is being sent
  if (context === "feedback") {
    console.log("🔁 Resetting chat history on feedback");
    chatHistories[patientId] = [];
    chatHistory = chatHistories[patientId];
  }

  if (chatHistory.length === 0) {
    chatHistory.push({
      role: "system",
      content: `You are VRX, a concise, nurse-like AI health assistant. Follow this strict flow:

1. User may respond in English, Urdu, or Roman Urdu. Convert all responses to English medically.
2. Ask: "What’s your main health concern?"
3. When user answers, respond only with a JSON array of symptoms. Example: ["Fever", "Cough", "Fatigue"]
4. When symptoms are selected, respond with strictly this format:
   Diagnose: [diagnosis or condition name]
   Medicine: [Medicine Name]
   Dosage: [e.g., 500mg]
   Frequency: [e.g., Twice a day]
   Duration: [e.g., 3 days]
   Instruction: [e.g., Take after food, drink water]
   Lab Test: [e.g., Required: CBC]
   Ask: "Did this help? (Yes/No)"
5. If user says No: Ask for more symptoms with a new symptom JSON array.
6. If user says Yes: Say "Glad I helped! What’s your next concern?"
NEVER explain. Stick to the exact format. Be very short.`,
    });
  }

  chatHistory.push({ role: "user", content: input });

  try {
    console.log("🧠 Sending to Groq:", JSON.stringify(chatHistory, null, 2));

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages: chatHistory,
        temperature: 0.4,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Groq API Error:", response.status, errorText);
      throw new Error(`Groq API Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error("Empty reply from AI");

    chatHistory.push({ role: "assistant", content: reply });

    const match = reply.match(/\[(.*?)\]/);
    const symptomsList = match
      ? match[1].split(",").map((s) => s.replace(/[\"'\[\]]/g, "").trim())
      : null;

    // ✅ Save if user accepted suggestion
    if (userMessage?.toLowerCase() === "yes" && reply.includes("Diagnose:")) {
      console.log("💾 User agreed. Checking columns...");
      await ensureColumnsExist();

      const diagnose = reply.match(/Diagnose:\s*\[(.*?)\]/i)?.[1] || null;
      const medicine = reply.match(/Medicine:\s*\[(.*?)\]/i)?.[1] || null;
      const dosage = reply.match(/Dosage:\s*\[(.*?)\]/i)?.[1] || null;
      const frequency = reply.match(/Frequency:\s*\[(.*?)\]/i)?.[1] || null;
      const duration = reply.match(/Duration:\s*\[(.*?)\]/i)?.[1] || null;
      const instruction = reply.match(/Instruction:\s*\[(.*?)\]/i)?.[1] || null;

      await db.query(`
        UPDATE patient SET 
          disease = $1,
          on_medications = $2,
          medical_history = $3,
          vitals = $4,
          allergies = $5,
          professional = $6
        WHERE id = $7
      `, [
        diagnose,
        medicine,
        dosage,
        frequency,
        duration,
        instruction,
        patientId
      ]);

      console.log("✅ Saved diagnosis for patient ID:", patientId);
    }

    return res.json({
      reply,
      symptomsList,
      isFeedback: reply.includes("Did this help?")
    });

  } catch (error) {
    console.error("❌ AI Error:", error.message);
    return res.status(500).json({
      reply: "Sorry, I couldn’t process that. Please try again.",
      symptomsList: null,
    });
  }
};

// ✅ GET /chat/diagnosis/:id
exports.getDiagnosisByPatientId = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(`
      SELECT id, name, disease, on_medications, medical_history, vitals, allergies, professional
      FROM patient WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const p = result.rows[0];

    res.status(200).json({
      patient_id: p.id,
      name: p.name,
      diagnosis: {
        disease: p.disease,
        medicine: p.on_medications,
        dosage: p.medical_history,
        frequency: p.vitals,
        duration: p.allergies,
        instruction: p.professional
      }
    });
  } catch (error) {
    console.error('❌ Diagnosis Fetch Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};
