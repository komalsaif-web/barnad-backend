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
      global.chatHistory = [];
      chatHistory = global.chatHistory;
    }

    if (chatHistory.length === 0) {
      chatHistory.push({
        role: "system",
        content: `You are VRX, a concise, nurse-like AI health assistant. Follow this strict flow:

1. Ask: \"What’s your main health concern?\"
2. When user answers, respond only with a JSON array of symptoms. Example: [\"Fever\", \"Cough\", \"Fatigue\"]
3. When symptoms are selected, respond with strictly this format:
   Suggestion: [diagnosis or condition name]
   Medicine: [Medicine Name]
   Dosage: [e.g., 500mg]
   Frequency: [e.g., Twice a day]
   Duration: [e.g., 3 days]
   Instruction: [e.g., Take after food, drink water]
   Lab Test: [e.g., Required: CBC]
   Ask: \"Did this help? (Yes/No)\"
4. If user says No: Ask for more symptoms with a new symptom JSON array.
5. If user says Yes: Say \"Glad I helped! What’s your next concern?\"
NEVER explain. Stick to the exact format. Be very short.`,
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

    if (!response.ok) throw new Error(`Groq API Error: ${response.status}`);

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) throw new Error("Empty reply from AI");

    chatHistory.push({ role: "assistant", content: reply });

    const match = reply.match(/\[(.*?)\]/);
    const symptomsList = match
      ? match[1]
          .split(",")
          .map((s) => s.replace(/[\"'\[\]]/g, "").trim())
      : null;

    return res.json({ reply, symptomsList, isFeedback: reply.includes("Did this help?") });
  } catch (error) {
    console.error("❌ AI Error:", error.message);
    return res.status(500).json({
      reply: "Sorry, I couldn’t process that. Please try again.",
      symptomsList: null,
    });
  }
};