let chatHistory = global.chatHistory || [];

export const handleChatMessage = async (req, res) => {
  const { message: userMessage, symptoms = [], context = "initial" } = req.body;

  if (!userMessage && symptoms.length === 0 && context !== "feedback") {
    return res.status(400).json({ reply: "Please share your health concern or select symptoms." });
  }

  if (!global.chatHistory) global.chatHistory = [];
  chatHistory = global.chatHistory;

  try {
    if (chatHistory.length === 0) {
      chatHistory.push({
        role: "system",
        content: `You are VRX, a professional nurse-like AI health assistant. Be concise and empathetic.

1. Start with: "What’s your main health concern?"
2. When user shares a concern:
   - Say: "Please check any symptoms you have:"
   - List JSON array of 3–5 symptoms: ["Symptom1", "Symptom2", "Symptom3"]
3. After symptoms are selected:
   - Suggestion: [short diagnosis]
   - Medicine: [e.g., Panadol, Mebeverine]
   - Lab Test (if needed): [e.g., Blood Test]
4. Ask: "Did this help? (Yes/No)"
5. If user says No:
   - Ask: "Any other symptoms?" and go back to step 2
6. If user says Yes:
   - Say: "Glad I helped! What’s your next concern?"
7. Use simple words only. No disclaimers.`
      });
    }

    let input;
    if (context === "symptoms") {
      input = `Symptoms: ${symptoms.join(", ")}`;
    } else if (context === "feedback") {
      input = `Feedback: ${userMessage}`;
    } else if (context === "refine") {
      input = `More details: ${symptoms.join(", ") || userMessage}`;
    } else {
      input = `Concern: ${userMessage}`;
    }

    chatHistory.push({ role: "user", content: input });

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`, // Vercel stores this automatically
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages: chatHistory,
        max_tokens: 200,
        temperature: 0.6,
      }),
    });

    if (!response.ok) throw new Error(`Groq API Error: ${response.status}`);
    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) throw new Error("Empty response from AI");

    chatHistory.push({ role: "assistant", content: reply });

    const match = reply.match(/\[(.*?)\]/);
    const symptomsList = match
      ? match[1].split(/,\s*/).map(s => s.replace(/['"\[\]]/g, '').trim())
      : null;

    return res.json({ reply, symptomsList });

  } catch (error) {
    console.error("❌ AI Error:", error.message);
    return res.status(500).json({
      reply: "Sorry, I couldn’t process that. Please try again.",
      symptomsList: null,
    });
  }
};
