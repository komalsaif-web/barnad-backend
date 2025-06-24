export const handleChatMessage = async (req, res) => {
  const { message: userMessage, symptoms = [], context = "initial" } = req.body;

  if (!userMessage && symptoms.length === 0 && context !== "feedback") {
    return res.status(400).json({ reply: "Please share your health concern or select symptoms." });
  }

  if (!global.chatHistory) global.chatHistory = [];
  const chatHistory = global.chatHistory;

  try {
    if (chatHistory.length === 0) {
      chatHistory.push({
        role: "system",
        content: `You are VRX, a professional nurse-like AI health assistant. Be concise, empathetic, and easy to understand.

1. Start with: "What’s your main health concern?"
2. When user shares a concern (e.g., "cancer", "fever"):
   - Respond: "I’m sorry you’re worried. Please check any symptoms you have:"
   - Provide 3–5 symptoms in: ["Symptom1", "Symptom2", "Symptom3"]
3. When symptoms are received:
   - Suggest a condition (e.g., "Possible Cold")
   - List 2–3 short actions (e.g., "Take paracetamol", "Rest", "See doctor")
   - Ask: "Did this help? (Yes/No)"
4. If user selects "No":
   - Respond: "I’m here to help! Please check more symptoms:"
   - Provide 3–5 new symptoms based on prior input.
5. If user selects "Yes":
   - Respond: "Glad I helped! What’s your next concern?"
6. Use simple words, no jargon. No PDF offers.
7. On error, return: "Sorry, I couldn’t process that. Please try again."`
      });
    }

    let input;
    if (context === "symptoms") {
      input = symptoms.length > 0
        ? `Symptoms: ${symptoms.join(", ")}`
        : userMessage;
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
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages: chatHistory,
        max_tokens: 150,
        temperature: 0.6,
      }),
    });

    if (!response.ok) {
      throw new Error(`API failed: ${response.status}`);
    }

    const data = await response.json();
    if (!data.choices?.[0]?.message?.content) {
      throw new Error("No valid AI response");
    }

    const reply = data.choices[0].message.content.trim();
    chatHistory.push({ role: "assistant", content: reply });

    const match = reply.match(/\[(.*?)\]/);
    const symptomsList = match
      ? match[1].split(/,\s*/).map(s => s.replace(/["'\[\]]/g, '').trim())
      : null;

    return res.json({ reply, symptomsList });
  } catch (error) {
    console.error("AI error:", error.message);
    return res.status(500).json({ reply: "Sorry, I couldn’t process that. Please try again.", symptomsList: null });
  }
};