const db = require('../config/db');
const lastDiagnosisReplies = {}; // 🧠 In-memory diagnosis store

// ✅ Ensure chat table exists
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
2. If user shares a concern, respond ONLY with a valid JSON array of 3–5 short symptoms. Example: ["Fever", "Cough", "Fatigue"]
3. If input starts with "Symptoms:", respond ONLY with:
Diagnose: ...  
Medicine: ...  
Dosage: ...  
Frequency: ...  
Duration: ...  
Instruction: ...  
Lab Test: ...  
Ask: "Did this help? (Yes/No)"
4. If user says No, ask for more symptoms in JSON array
5. If user says Yes, say "Glad I helped! What's your next concern?"
NEVER explain anything. ALWAYS follow format.`
    };

    // 🟠 Special handling if user says "no"
    if (userMessage?.toLowerCase() === "no") {
      const retryMessages = [systemPrompt, { role: "user", content: "I need more symptom options" }];

      const retryRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama3-70b-8192",
          messages: retryMessages,
          temperature: 0.4,
          max_tokens: 300,
        }),
      });

      const retryData = await retryRes.json();
      const retryReply = retryData.choices?.[0]?.message?.content?.trim();

      let retrySymptoms = [];
      try {
        const parsed = JSON.parse(retryReply);
        if (Array.isArray(parsed)) retrySymptoms = parsed.map(s => s.trim());
      } catch (err) {
        console.warn("⚠️ Failed to parse retry symptoms:", err.message);
      }

      return res.json({
        reply: "Please select from these symptoms:",
        symptomsList: retrySymptoms,
        isFeedback: false
      });
    }

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

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();
    console.log("🧠 AI Reply:", reply);

    let symptomsList = null;
    if (context === "initial" && reply.startsWith("[") && reply.endsWith("]")) {
      try {
        const parsed = JSON.parse(reply);
        if (Array.isArray(parsed)) symptomsList = parsed.map(s => s.trim());
      } catch (err) {
        console.warn("⚠️ Could not parse symptoms:", err.message);
      }
    }

    if (context === "symptoms" && reply.includes("Diagnose:")) {
      lastDiagnosisReplies[id] = reply;
    }

    if (userMessage?.toLowerCase() === "yes") {
      const diagnosisReply = reply.includes("Diagnose:") ? reply : lastDiagnosisReplies[id];
      if (diagnosisReply) {
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

        delete lastDiagnosisReplies[id];
        console.log("✅ Diagnosis saved.");
      }
    }

    return res.json({
      reply,
      symptomsList,
      isFeedback: reply.includes("Did this help?")
    });

  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).json({ reply: "Something went wrong", symptomsList: null });
  }
};

// ✅ GET /api/chat/ai-diagnosis/:id
exports.getLatestAiDiagnosis = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(`
      SELECT * FROM chat WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 1
    `, [id]);

    if (!result.rows.length) return res.status(404).json({ error: 'No diagnosis found' });

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
        created_at: d.created_at
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
};

// ✅ PUT /api/chat/ai-diagnosis/:chatId
exports.updateAiDiagnosis = async (req, res) => {
  const { chatId } = req.params;
  const { diagnose, medicine, dosage, frequency, duration, instruction, lab_test } = req.body;

  try {
    const result = await db.query(`
      UPDATE chat SET diagnose = $1, medicine = $2, dosage = $3, frequency = $4, duration = $5, instruction = $6, lab_test = $7
      WHERE id = $8 RETURNING *
    `, [diagnose, medicine, dosage, frequency, duration, instruction, lab_test, chatId]);

    if (!result.rows.length) return res.status(404).json({ error: 'Diagnosis not found to update' });

    res.json({ message: "Diagnosis updated successfully", updatedDiagnosis: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to update diagnosis" });
  }
};
