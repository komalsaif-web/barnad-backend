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
        content: `You are VRX, a helpful AI medical assistant.
Ask what the user is feeling.
If the user gives a symptom or complaint (like fever, stomach pain, cough), respond ONLY with 3–5 relevant follow-up symptoms in checklist format.
For example: ["Headache", "Vomiting", "Chills"]
Wait for user to select symptoms.
Then give:
- Short condition name (e.g. "Flu")
- 2–3 word treatment suggestions (e.g. "Take rest", "Drink fluids")
Finally ask:
✅ Did this help?
📄 Want this as PDF?
Keep it short and to the point.`
      });
    }

    const input = symptoms.length > 0
      ? `${userMessage}\nPatient selected: ${symptoms.join(", ")}`
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

    // Dynamically extract checklist from AI response
    const match = reply.match(/\[(.*?)\]/);
    const symptomsList = match ? match[1].split(/,\s*/).map(s => s.replace(/[\[\]\"]+/g, '').trim()) : null;

    return res.json({ reply, symptomsList });
  } catch (error) {
    console.error("AI error:", error);
    return res.status(500).json({ reply: "⚠️ AI request failed." });
  }
};