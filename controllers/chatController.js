let chatHistory = global.chatHistory || [];

export const handleChatMessage = async (req, res) => {
  const { message: userMessage, symptoms = [], context = "initial" } = req.body;

  if (!userMessage && symptoms.length === 0 && context !== "feedback") {
    return res.status(400).json({ reply: "Please describe your health issue or select symptoms." });
  }

  if (!global.chatHistory) global.chatHistory = [];
  chatHistory = global.chatHistory;

  try {
    if (chatHistory.length === 0) {
      chatHistory.push({
        role: "system",
        content: `You are VRX, a helpful, concise, nurse-like AI health assistant. Follow this exact flow:

1. Start with: "What’s your main health concern?"
2. When user answers, show 3–5 symptoms like: ["Nausea", "Bloating", "Cramps"]
3. When symptoms selected:
   - Suggestion: [condition name]
   - Medicine: [short list like Panadol, ORS]
   - Lab Test (if needed): [Blood Test]
4. Ask: "Did this help? (Yes/No)"
5. If user says "No": "Please check more symptoms:"
6. If user says "Yes": "Glad I helped! What’s your next concern?"
Use only short helpful responses. No disclaimers.`
      });
    }

    let input = "";
    if (context === "symptoms") {
      input = `Symptoms: ${symptoms.join(", ")}`;
    } else if (context === "feedback") {
      input = `Feedback: ${userMessage}`;
    } else {
      input = `Concern: ${userMessage}`;
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
        temperature: 0.5,
        max_tokens: 200,
      }),
    });

    if (!response.ok) throw new Error(`Groq API Error: ${response.status}`);

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) throw new Error("Empty reply from model");

    chatHistory.push({ role: "assistant", content: reply });

    // Extract symptoms list if available
    const match = reply.match(/\[(.*?)\]/);
    const symptomsList = match
      ? match[1].split(/,\s*/).map(sym => sym.replace(/["'\[\]]/g, '').trim())
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
