import { config } from "dotenv";
config();

const chatHistory = [];

export async function handleChat(req, res) {
  const { message: userMessage, symptoms = [], context = "initial" } = req.body;

  if (!userMessage && symptoms.length === 0) {
    return res.status(400).json({ reply: "Please describe your problem." });
  }

  try {
    if (chatHistory.length === 0) {
      chatHistory.push({
        role: "system",
        content: `You are a concise and smart AI health assistant. Follow this strict format:

1. Ask: "What is your medical problem?"
2. When user replies, suggest a JSON array of 3–5 symptoms related to that issue. Example: ["Nausea", "Fatigue", "Bloating"]
3. After each symptom selection, give:
   Suggestion: [short diagnosis]
   Medicine: [Panadol, Mebeverine]
   Lab Test (if needed): [Blood Test]
4. Then ask: "Do you agree with this suggestion? (Yes/No)"
5. If user says "No", ask: "Any other symptoms?" and repeat from step 2.
Repeat until the user agrees.
Do not add extra text or explanation. Use stepwise short responses only.`
      });
    }

    const input = symptoms.length > 0
      ? `Symptoms selected: ${symptoms.join(", ")}`
      : userMessage;

    chatHistory.push({ role: "user", content: input });

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages: chatHistory,
        temperature: 0.3,
      }),
    });

    if (!groqRes.ok) {
      throw new Error(`Groq API Error: ${groqRes.status}`);
    }

    const data = await groqRes.json();
    const aiReply = data.choices[0].message.content.trim();

    const symptomsMatch = aiReply.match(/\[(.*?)\]/);
    const symptomsList = symptomsMatch
      ? symptomsMatch[1].split(',').map(s => s.replace(/['"\[\]]/g, '').trim())
      : null;

    chatHistory.push({ role: "assistant", content: aiReply });

    return res.json({
      reply: aiReply,
      symptomsList,
      isFeedback: /agree/i.test(aiReply),
    });

  } catch (error) {
    console.error("❌ Error:", error);
    return res.status(500).json({ reply: "System error. Please try again." });
  }
}
