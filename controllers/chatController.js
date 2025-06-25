const db = require('../config/db');
let chatHistories = {};

exports.handleChatMessage = async (req, res) => {
  const { message: userMessage, symptoms = [], context = "initial", patientId } = req.body;
  console.log("🟡 Incoming:", { patientId, userMessage, symptoms, context });

  if (!patientId) return res.status(400).json({ error: "patientId is required" });

  if (!chatHistories[patientId]) chatHistories[patientId] = [];
  let chatHistory = chatHistories[patientId];

  if (!userMessage && symptoms.length === 0 && context !== "feedback") {
    return res.status(400).json({ reply: "Please describe your health issue or select symptoms." });
  }

  try {
    let input = "";
    if (context === "symptoms") input = `Symptoms: ${symptoms.join(", ")}`;
    else if (context === "feedback") input = `Feedback: ${userMessage}`;
    else input = `Concern: ${userMessage}`;

    const lastConcern = chatHistory.slice().reverse().find(msg => msg.role === "user" && msg.content.startsWith("Concern:"))?.content;
    const sameConcern = lastConcern && lastConcern.toLowerCase() === input.toLowerCase();

    if ((context === "initial" && sameConcern) || context === "feedback") {
      chatHistories[patientId] = [];
      chatHistory = chatHistories[patientId];
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
        "Content-Type": "application/json"
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
      console.error("❌ Groq API Error:", errorText);
      throw new Error(errorText);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error("Empty AI reply");

    chatHistory.push({ role: "assistant", content: reply });

    let symptomsList = null;
    if (context === "initial" && reply.startsWith("[")) {
      try {
        const parsed = JSON.parse(reply);
        if (Array.isArray(parsed)) symptomsList = parsed.map(x => x.trim());
      } catch (e) {
        console.warn("⚠️ Failed to parse symptom list");
      }
    }

    // ✅ Save suggestion to diagnosis_history if user said Yes
    if (userMessage?.toLowerCase() === "yes" && reply.toLowerCase().includes("diagnose:")) {
      const diagnose = reply.match(/Diagnose:\s*\[?(.*?)\]?(\n|$)/i)?.[1]?.trim();
      const medicine = reply.match(/Medicine:\s*\[?(.*?)\]?(\n|$)/i)?.[1]?.trim();
      const dosage = reply.match(/Dosage:\s*\[?(.*?)\]?(\n|$)/i)?.[1]?.trim();
      const frequency = reply.match(/Frequency:\s*\[?(.*?)\]?(\n|$)/i)?.[1]?.trim();
      const duration = reply.match(/Duration:\s*\[?(.*?)\]?(\n|$)/i)?.[1]?.trim();
      const instruction = reply.match(/Instruction:\s*\[?(.*?)\]?(\n|$)/i)?.[1]?.trim();
      const labTest = reply.match(/Lab Test:\s*\[?(.*?)\]?(\n|$)/i)?.[1]?.trim();

      await db.query(`
        INSERT INTO diagnosis_history 
        (patient_id, diagnose, medicine, dosage, frequency, duration, instructions, lab_test)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        patientId,
        diagnose,
        medicine,
        dosage,
        frequency,
        duration,
        instruction,
        labTest
      ]);

      console.log("✅ Diagnosis saved to Supabase history");
    }

    return res.json({
      reply,
      symptomsList,
      isFeedback: reply.includes("Did this help?")
    });

  } catch (err) {
    console.error("❌ Error:", err.message);
    return res.status(500).json({ reply: "Something went wrong", symptomsList: null });
  }
};

// ✅ GET: /chat/history/:id
exports.getDiagnosisHistory = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(`
      SELECT diagnose, medicine, dosage, frequency, duration, instructions, lab_test, created_at
      FROM diagnosis_history
      WHERE patient_id = $1
      ORDER BY created_at DESC
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No diagnosis history found for this patient." });
    }

    return res.status(200).json({
      patient_id: id,
      history: result.rows
    });

  } catch (error) {
    console.error("❌ Fetch Error:", error.message);
    res.status(500).json({ error: "Failed to fetch diagnosis history." });
  }
};
