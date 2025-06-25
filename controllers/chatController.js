const db = require('../config/db');

exports.handleChatMessage = async (req, res) => {
  const { message: userMessage, symptoms = [], context = "initial", patientId } = req.body;

  if (!patientId) return res.status(400).json({ error: "patientId is required" });
  if (!userMessage && symptoms.length === 0) {
    return res.status(400).json({ reply: "Please describe your health issue or select symptoms." });
  }

  try {
    let input = context === "symptoms"
      ? `Symptoms: ${symptoms.join(", ")}`
      : `Concern: ${userMessage}`;

    const messages = [
      {
        role: "system",
        content: `You are VRX, a nurse-like AI health assistant. Follow this exact flow:
1. User gives concern → you respond with JSON array of symptoms: ["Fever", "Cough"]
2. If user gives symptoms → respond:
Diagnose: [Condition]
Medicine: [Name]
Dosage: [500mg]
Frequency: [Twice a day]
Duration: [3 days]
Instruction: [Take after food]
Lab Test: [Required: CBC]
Ask: "Did this help? (Yes/No)"`,
      },
      { role: "user", content: input }
    ];

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages,
        temperature: 0.4,
        max_tokens: 300,
      }),
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) throw new Error("Empty AI response");

    // ✅ Save to DB if user said "Yes" and response contains diagnosis
    if (userMessage.toLowerCase() === "yes" && reply.includes("Diagnose:")) {
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
        patientId
      ]);
    }

    return res.json({ reply });

  } catch (err) {
    console.error("❌ Error:", err.message);
    return res.status(500).json({ reply: "Something went wrong. Try again." });
  }
};

exports.getDiagnosisByPatientId = async (req, res) => {
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

    return res.status(200).json({
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
  } catch (err) {
    console.error("❌ Fetch Error:", err.message);
    res.status(500).json({ error: "Failed to fetch diagnosis" });
  }
};
