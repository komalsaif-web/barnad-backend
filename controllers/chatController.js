const db = require('../config/db');
let chatHistories = {};        // per-patient chat memory
let lastDiagnosisReply = {};   // store last Diagnose reply per id

exports.handleChatMessage = async (req, res) => {
  const { message: userMessage, symptoms = [], context = "initial", id } = req.body;

  console.log("🟡 Incoming:", { id, userMessage, symptoms, context });
  if (!id) return res.status(400).json({ error: "Patient ID (id) is required" });

  if (!chatHistories[id]) chatHistories[id] = [];
  let chatHistory = chatHistories[id];

  if (!userMessage && symptoms.length === 0 && context !== "feedback") {
    return res.status(400).json({ reply: "Please describe your health issue or select symptoms." });
  }

  try {
    let input = "";
    if (context === "symptoms") input = `Symptoms: ${symptoms.join(", ")}`;
    else if (context === "feedback") input = `Feedback: ${userMessage}`;
    else input = `Concern: ${userMessage}`;

    const lastConcern = chatHistory.slice().reverse().find(
      (msg) => msg.role === "user" && msg.content.startsWith("Concern:")
    )?.content;

    const sameConcern = lastConcern && lastConcern.toLowerCase() === input.toLowerCase();

    if ((context === "initial" && sameConcern) || context === "feedback") {
      console.log("🔁 Resetting chat history...");
      chatHistories[id] = [];
      chatHistory = chatHistories[id];
    }

    if (chatHistory.length === 0) {
      chatHistory.push({
        role: "system",
        content: `You are VRX, a concise, nurse-like AI health assistant. Follow this strict flow:
1. Ask: "What's your main health concern?"
2. When user answers, respond ONLY with a valid JSON array of 3–5 short symptoms, no explanation. Example: ["Fever", "Cough", "Fatigue"]
3. When symptoms are selected, respond with strictly this format:
   Diagnose: [diagnosis or condition name]
   Medicine: [Medicine Name]
   Dosage: [e.g., 500mg]
   Frequency: [e.g., Twice a day]
   Duration: [e.g., 3 days]
   Instruction: [e.g., Take after food, drink water]
   Lab Test: [e.g., Required: CBC]
   Ask: "Did this help? (Yes/No)"
4. If user says No: Ask for more symptoms with a new symptom JSON array.
5. If user says Yes: Say "Glad I helped! What's your next concern?"
NEVER explain. Stick to the exact format. Be very short.`
      });
    }

    chatHistory.push({ role: "user", content: input });

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

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error("Empty reply");

    chatHistory.push({ role: "assistant", content: reply });

    // ✅ Save reply if it contains Diagnose
    if (reply.includes("Diagnose:")) {
      lastDiagnosisReply[id] = reply;
    }

    // ✅ Parse symptoms
    let symptomsList = null;
    if (context === "initial" && reply.startsWith("[") && reply.endsWith("]")) {
      try {
        const parsed = JSON.parse(reply);
        if (Array.isArray(parsed)) {
          symptomsList = parsed.map(s => s.trim()).filter(Boolean);
        }
      } catch (err) {
        console.warn("⚠️ JSON parse error:", err.message);
      }
    }

    // ✅ When user says "yes", use the saved diagnosis
    if (userMessage?.toLowerCase() === "yes" && lastDiagnosisReply[id]) {
      console.log("💾 Saving diagnosis to DB...");

      const diagnosisReply = lastDiagnosisReply[id];

      const diagnose = diagnosisReply.match(/Diagnose:\s*\[(.*?)\]/i)?.[1] || null;
      const medicine = diagnosisReply.match(/Medicine:\s*\[(.*?)\]/i)?.[1] || null;
      const dosage = diagnosisReply.match(/Dosage:\s*\[(.*?)\]/i)?.[1] || null;
      const frequency = diagnosisReply.match(/Frequency:\s*\[(.*?)\]/i)?.[1] || null;
      const duration = diagnosisReply.match(/Duration:\s*\[(.*?)\]/i)?.[1] || null;
      const instruction = diagnosisReply.match(/Instruction:\s*\[(.*?)\]/i)?.[1] || null;
      const labTest = diagnosisReply.match(/Lab Test:\s*\[(.*?)\]/i)?.[1] || null;

      await db.query(`
        UPDATE patient SET 
          disease = $1,
          medicine = $2,
          dosage = $3,
          frequency = $4,
          duration = $5,
          instructions = $6,
          lab_test = $7
        WHERE id = $8
      `, [diagnose, medicine, dosage, frequency, duration, instruction, labTest, id]);

      console.log("✅ Saved to patient id:", id);
    }

    return res.json({
      reply,
      symptomsList,
      isFeedback: reply.includes("Did this help?")
    });

  } catch (error) {
    console.error("❌ Error:", error.message);
    res.status(500).json({ reply: "Sorry, something went wrong.", symptomsList: null });
  }
};

// ✅ GET /api/chat/diagnosis/:id
exports.getDiagnosisByPatientId = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(`
      SELECT id, name, disease, medicine, dosage, frequency, duration, instructions, lab_test
      FROM patient WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const p = result.rows[0];
    res.json({
      id: p.id,
      name: p.name || "Unknown",
      diagnosis: {
        disease: p.disease,
        medicine: p.medicine,
        dosage: p.dosage,
        frequency: p.frequency,
        duration: p.duration,
        instruction: p.instructions,
        labTest: p.lab_test
      }
    });

  } catch (error) {
    console.error('❌ Diagnosis Fetch Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};
