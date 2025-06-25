const db = require('../config/db');
let chatHistories = {}; // store per-patient chat history in-memory

// ✅ POST /chat
exports.handleChatMessage = async (req, res) => {
  const { message: userMessage, symptoms = [], context = "initial", id } = req.body;

  console.log("🟡 Incoming Request:", { id, userMessage, symptoms, context });

  if (!id) {
    console.warn("⚠️ id missing in request");
    return res.status(400).json({ error: "id is required" });
  }

  // Initialize history if not exist
  if (!chatHistories[id]) chatHistories[id] = [];

  let chatHistory = chatHistories[id];

  if (!userMessage && symptoms.length === 0 && context !== "feedback") {
    return res.status(400).json({
      reply: "Please describe your health issue or select symptoms.",
    });
  }

  try {
    let input = "";
    if (context === "symptoms") {
      input = `Symptoms: ${symptoms.join(", ")}`;
    } else if (context === "feedback") {
      input = `Feedback: ${userMessage}`;
    } else {
      input = `Concern: ${userMessage}`;
    }

    const lastConcern = chatHistory
      .slice()
      .reverse()
      .find((msg) => msg.role === "user" && msg.content.startsWith("Concern:"))?.content;

    const sameConcern = lastConcern && lastConcern.toLowerCase() === input.toLowerCase();

    if ((context === "initial" && sameConcern) || context === "feedback") {
      console.log("🔁 Resetting chat history for repeated concern or feedback");
      chatHistories[id] = [];
      chatHistory = chatHistories[id];
    }

    if (chatHistory.length === 0) {
      chatHistory.push({
        role: "system",
        content: `You are VRX, a concise, nurse-like AI health assistant. Follow this strict flow:

1. Ask: "What’s your main health concern?"
2. When user answers, respond only with a JSON array of symptoms. Example: ["Fever", "Cough", "Fatigue"]
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
5. If user says Yes: Say "Glad I helped! What’s your next concern?"
NEVER explain. Stick to the exact format. Be very short.`,
      });
    }

    chatHistory.push({ role: "user", content: input });

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
    console.log("✅ Groq Response:", JSON.stringify(data, null, 2));

    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error("Empty reply from AI");

    chatHistory.push({ role: "assistant", content: reply });

    const match = reply.match(/\[(.*?)\]/);
    const symptomsList = match
      ? match[1]
          .split(",")
          .map((s) => s.replace(/[\"'\[\]]/g, "").trim())
      : null;

    // ✅ Save to DB if user said "Yes"
    if (userMessage.toLowerCase() === "yes" && reply.includes("Diagnose:")) {
      console.log("💾 Saving diagnosis to DB...");

      const diagnose = reply.match(/Diagnose:\s*\[(.*?)\]/i)?.[1] || null;
      const medicine = reply.match(/Medicine:\s*\[(.*?)\]/i)?.[1] || null;
      const dosage = reply.match(/Dosage:\s*\[(.*?)\]/i)?.[1] || null;
      const frequency = reply.match(/Frequency:\s*\[(.*?)\]/i)?.[1] || null;
      const duration = reply.match(/Duration:\s*\[(.*?)\]/i)?.[1] || null;
      const instruction = reply.match(/Instruction:\s*\[(.*?)\]/i)?.[1] || null;
      const labTest = reply.match(/Lab Test:\s*\[(.*?)\]/i)?.[1] || null;

      await db.query(`
        UPDATE patient SET 
          disease = $1,
          on_medications = $2,
          medical_history = $3,
          vitals = $4,
          allergies = $5,
          professional = $6,
          lab_test = $7
        WHERE id = $8
      `, [
        diagnose,
        medicine,
        dosage,
        frequency,
        duration,
        instruction,
        labTest,
        id
      ]);

      console.log("✅ Diagnosis saved for patient ID:", id);
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
exports.getDiagnosisByid = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(`
      SELECT id, name, disease, on_medications, medical_history, vitals, allergies, professional, lab_test
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
        instruction: p.professional,
        labTest: p.lab_test || null
      }
    });
  } catch (error) {
    console.error('❌ Diagnosis Fetch Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};
