const db = require('../config/db');

// 🧠 Temporary in-memory storage for last diagnosis per patient
const lastDiagnosisReplies = {}; // key = patient_id, value = diagnosis string

// ✅ Optional: Ensure chat table exists once
async function ensureChatTableExists() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS chat (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER REFERENCES patient(id) ON DELETE CASCADE,
      diagnose TEXT,
      medicine TEXT,
      dosage TEXT,
      frequency TEXT,
      duration TEXT,
      instruction TEXT,
      lab_test TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// ✅ POST /api/chat
exports.handleChatMessage = async (req, res) => {
  const { message: userMessage, symptoms = [], context = "initial", id } = req.body;
  console.log("🟡 Incoming:", { id, userMessage, symptoms, context });

  if (!id) return res.status(400).json({ error: "Patient ID (id) is required" });

  if (!userMessage && symptoms.length === 0 && context !== "feedback") {
    return res.status(400).json({ reply: "Please describe your health issue or select symptoms." });
  }

  try {
    let input = "";
    if (context === "symptoms") input = `Symptoms: ${symptoms.join(", ")}`;
    else if (context === "feedback") input = `Feedback: ${userMessage}`;
    else input = `Concern: ${userMessage}`;

    const systemPrompt = {
      role: "system",
      content: `You are VRX, a concise, nurse-like AI health assistant. Follow this strict flow:

1. Ask: "What's your main health concern?"

2. If user shares a concern, respond ONLY with a valid JSON array of 3–5 short symptoms. No explanation. Example: ["Fever", "Cough", "Fatigue"]

3. If input starts with "Symptoms:", do NOT return more symptoms. Instead, respond ONLY with the following strict format:

Diagnose: [diagnosis or condition name]  
Medicine: [Medicine Name]  
Dosage: [e.g., 500mg]  
Frequency: [e.g., Twice a day]  
Duration: [e.g., 3 days]  
Instruction: [e.g., Take after food, drink water]  
Lab Test: [e.g., Required: CBC]  
Ask: "Did this help? (Yes/No)"

4. If user says No, ask for more symptoms in JSON array

5. If user says Yes, say "Glad I helped! What's your next concern?"

ALWAYS follow the format exactly. Do NOT explain anything.`
    };

    const chatMessages = [systemPrompt, { role: "user", content: input }];

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages: chatMessages,
        temperature: 0.4,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error("Empty reply from AI");

    console.log("🧠 AI Reply:", reply);

    // ✅ Extract symptoms if it's a list (only on initial message)
    let symptomsList = null;
    if (context === "initial" && reply.startsWith("[") && reply.endsWith("]")) {
      try {
        const parsed = JSON.parse(reply);
        if (Array.isArray(parsed)) {
          symptomsList = parsed.map((s) => s.trim()).filter(Boolean);
        }
      } catch (err) {
        console.warn("⚠️ Could not parse symptoms:", err.message);
      }
    }

    // ✅ Save last diagnosis in memory if context was "symptoms" and AI gave diagnosis
    if (context === "symptoms" && reply.includes("Diagnose:")) {
      lastDiagnosisReplies[id] = reply;
    }

    // ✅ On "yes", try saving either current reply or last one
    if (userMessage?.toLowerCase() === "yes") {
      const diagnosisReply = reply.includes("Diagnose:") ? reply : lastDiagnosisReplies[id];

      if (diagnosisReply && diagnosisReply.includes("Diagnose:")) {
        const extractField = (label) => {
          const regex = new RegExp(`${label}:\\s*(?:\\[(.*?)\\]|(.*))`, 'i');
          const match = diagnosisReply.match(regex);
          return match?.[1]?.trim() || match?.[2]?.trim() || null;
        };

        const diagnose = extractField("Diagnose");
        const medicine = extractField("Medicine");
        const dosage = extractField("Dosage");
        const frequency = extractField("Frequency");
        const duration = extractField("Duration");
        const instruction = extractField("Instruction");
        const labTest = extractField("Lab Test");

        await db.query(`
          INSERT INTO chat (
            patient_id, diagnose, medicine, dosage, frequency, duration, instruction, lab_test
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [id, diagnose, medicine, dosage, frequency, duration, instruction, labTest]);

        console.log("✅ Diagnosis saved from memory for patient ID:", id);

        // ✅ Clear saved reply after saving
        delete lastDiagnosisReplies[id];
      }
    }

    return res.json({
      reply,
      symptomsList,
      isFeedback: reply.includes("Did this help?")
    });

  } catch (error) {
    console.error("❌ Error:", error.message);
    return res.status(500).json({ reply: "Something went wrong", symptomsList: null });
  }
};

// ✅ GET /api/chat/ai-diagnosis/:id
exports.getLatestAiDiagnosis = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(`
      SELECT * FROM chat
      WHERE patient_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No diagnosis found' });
    }

    const d = result.rows[0];
    res.json({
      id: d.id,
      patient_id: d.patient_id,
      diagnosis: {
        disease: d.diagnose,
        medicine: d.medicine,
        dosage: d.dosage,
        frequency: d.frequency,
        duration: d.duration,
        instruction: d.instruction,
        labTest: d.lab_test,
        created_at: d.created_at,
      }
    });

  } catch (err) {
    console.error("❌ Get Diagnosis Error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
// ✅ PUT /api/chat/ai-diagnosis/:chatId
exports.updateAiDiagnosis = async (req, res) => {
  const { chatId } = req.params;
  const {
    diagnose,
    medicine,
    dosage,
    frequency,
    duration,
    instruction,
    lab_test,
  } = req.body;

  try {
    const result = await db.query(
      `UPDATE chat SET
        diagnose = $1,
        medicine = $2,
        dosage = $3,
        frequency = $4,
        duration = $5,
        instruction = $6,
        lab_test = $7
      WHERE id = $8
      RETURNING *`,
      [diagnose, medicine, dosage, frequency, duration, instruction, lab_test, chatId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Diagnosis not found to update' });
    }

    res.json({ message: "Diagnosis updated successfully", updatedDiagnosis: result.rows[0] });
  } catch (error) {
    console.error("❌ Update Diagnosis Error:", error.message);
    res.status(500).json({ error: "Failed to update diagnosis" });
  }
};
