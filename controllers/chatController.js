export const handleChatMessage = async (req, res) => {
  const { message: userMessage, symptoms = [] } = req.body;

  if (!userMessage && symptoms.length === 0) {
    return res.status(400).json({ reply: "Message or symptoms required." });
  }

  if (!global.chatHistory) global.chatHistory = [];
  const chatHistory = global.chatHistory;

  try {
    if (chatHistory.length === 0) {
      chatHistory.push({
        role: "system",
        content: `You are VRX, a helpful AI health assistant.

Ask "What’s your main health concern?"

When the user replies with a symptom or illness (e.g. "kidney pain", "fever", "cold"):
1. Respond with a short checklist of 3–5 related symptoms in this format:
["Burning urination", "Blood in urine", "Fever", "Lower back pain"]

DO NOT write numbered questions or long sentences. JUST return the checklist.

2. Wait for the user to select symptoms.

When symptoms are received:
- Respond with a likely condition (e.g., "Urinary Tract Infection")
- Suggest 2–3 short treatments (e.g., "Drink water", "Take painkiller", "Visit doctor")

Finally ask:
✅ Did you like this suggestion?
📄 Want this conversation as PDF?

Do not write anything extra. Keep it concise and clean.`
      });
    }

    const input = symptoms.length > 0
      ? `${userMessage || "Symptoms selected"}\nPatient selected: ${symptoms.join(", ")}`
      : userMessage;

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

    // Extract checklist array from response (e.g., ["Burning urination", "Fever"])
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
