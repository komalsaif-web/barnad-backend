export const handleChatMessage = async (req, res) => {
  const { message: userMessage, symptoms = [], context = "initial" } = req.body;

  if (!userMessage && symptoms.length === 0 && context !== "feedback") {
    return res.status(400).json({ reply: "Please tell me your health concern or select symptoms." });
  }

  if (!global.chatHistory) global.chatHistory = [];
  const chatHistory = global.chatHistory;

  try {
    if (chatHistory.length === 0) {
      chatHistory.push({
        role: "system",
        content: `You are VRX, a nurse-like AI health assistant. Be concise, empathetic, and professional.

1. Start by asking: "What's your main health concern?"
2. When the user describes an illness (e.g., "kidney pain", "fever"):
   - Respond with: "I’m sorry you’re feeling this way. Please select any of these symptoms you’re experiencing:"
   - Provide a checklist of 3–5 related symptoms in this format: ["Symptom1", "Symptom2", "Symptom3"]
3. When symptoms are received:
   - Suggest a likely condition (e.g., "Possible Urinary Tract Infection")
   - Recommend 2–3 short treatments (e.g., "Drink water", "Take ibuprofen", "See a doctor")
   - Ask: "Did you find this suggestion helpful? (Yes/No)"
4. If the user says "No" to the suggestion:
   - Respond with: "I’m here to help! Could you share more details about your symptoms or what feels off?"
   - Provide a new checklist of 3–5 refined symptoms based on the user’s input.
5. If the user says "Yes", reset to: "Glad I could help! Any other health concerns?"
6. Do NOT offer PDF downloads. Keep responses short and clear.`
      });
    }

    let input;
    if (context === "symptoms") {
      input = symptoms.length > 0
        ? `Patient selected: ${symptoms.join(", ")}`
        : userMessage;
    } else if (context === "feedback") {
      input = `User feedback: ${userMessage}`;
    } else if (context === "refine") {
      input = `User provided more details: ${userMessage}`;
    } else {
      input = userMessage;
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
      }),
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || "⚠️ AI didn't reply properly.";
    chatHistory.push({ role: "assistant", content: reply });

    const match = reply.match(/\[(.*?)\]/);
    const symptomsList = match
      ? match[1].split(/,\s*/).map(s => s.replace(/["'\[\]]/g, '').trim())
      : null;

    return res.json({ reply, symptomsList });
  } catch (error) {
    console.error("AI error:", error);
    return res.status(500).json({ reply: "⚠️ AI request failed." });
  }
};