let chatHistory = global.chatHistory || [];

export const handleChatMessage = async (req, res) => {
  const { message: userMessage, symptoms = [], context = "initial" } = req.body;

  if (!userMessage && symptoms.length === 0 && context !== "feedback") {
    return res.status(400).json({
      reply: "Please describe your health issue or select symptoms.",
    });
  }

  if (!global.chatHistory) global.chatHistory = [];
  chatHistory = global.chatHistory;

  try {
    // System prompt (initial instructions to AI)
    if (chatHistory.length === 0) {
      chatHistory.push({
        role: "system",
        content: `You are VRX, a helpful, concise, nurse-like AI health assistant. Follow this strict flow:

1. Ask: "What’s your main health concern?"
2. When user answers, respond only with a JSON array of symptoms. Example: ["Fever", "Cough", "Fatigue"]
3. When symptoms are selected, respond with:
   Suggestion: [condition]
   Medicine: [e.g., Panadol, ORS]
   Lab Test: [e.g., Blood Test]
   Ask: "Did this help? (Yes/No)"
4. If user says No: "Please check more symptoms:" and show new JSON array.
5. If user says Yes: "Glad I helped! What’s your next concern?"
Never explain. Only short responses. Follow format strictly.`,
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
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`, // Will work on Vercel env
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages: chatHistory,
        temperature: 0.4,
        max_tokens: 200,
      }),
    });

    if (!response.ok) throw new Error(`Groq API Error: ${response.status}`);

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) throw new Error("Empty reply from AI");

    chatHistory.push({ role: "assistant", content: reply });

    // Extract symptoms (if array present)
    const match = reply.match(/\[(.*?)\]/);
    const symptomsList = match
      ? match[1]
          .split(",")
          .map((s) => s.replace(/["'\[\]]/g, "").trim())
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
