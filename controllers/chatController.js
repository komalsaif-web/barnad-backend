export const handleChatMessage = async (req, res) => {
  const { message: userMessage } = req.body;

  if (!userMessage) {
    return res.status(400).json({ reply: "Message is required." });
  }

  // Store chat history globally (can replace with DB or session-based in real app)
  if (!global.chatHistory) global.chatHistory = [];
  const chatHistory = global.chatHistory;

  try {
    // First message – classify if health-related
    if (chatHistory.length === 0) {
      const classifyRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama3-70b-8192",
          messages: [
            {
              role: "system",
              content:
                "You are a classifier. If the message is about health, symptoms, illness or medicine, reply with only 'yes'. Otherwise, reply 'no'.",
            },
            { role: "user", content: userMessage },
          ],
        }),
      });

      const classifyData = await classifyRes.json();
      const isHealth = classifyData.choices?.[0]?.message?.content?.trim().toLowerCase();

      if (isHealth !== "yes") {
        return res.json({
          reply:
            "⚠️ I'm here to assist only with **medicine or health-related issues**. Please describe your symptoms or ask about medicine.",
        });
      }

      // Add system instructions for follow-up messages
      chatHistory.push({
        role: "system",
        content: `
You are a helpful medical assistant named VRX.
Ask the user one question at a time related to their symptoms.

Always give answers as bullet points like this:
- Yes
- No
- Sometimes

DO NOT use A) / B) / C). Only use - bullets.
After 2-3 questions, suggest a likely condition and basic treatment.

Always end with:
"💡 Get well soon! Stay healthy and take care!"
        `,
      });
    }

    chatHistory.push({ role: "user", content: userMessage });

    const chatRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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

    const chatData = await chatRes.json();
    const aiReply = chatData.choices?.[0]?.message?.content?.trim() || "⚠️ Unable to get a valid response.";

    const finalReply = aiReply.replace(
      /This is AI-generated advice.*$/i,
      "💡 Get well soon! Stay healthy and take care!"
    );

    chatHistory.push({ role: "assistant", content: finalReply });

    res.json({ reply: finalReply });
  } catch (err) {
    console.error("❌ API Error:", err);
    res.status(500).json({ reply: "⚠️ Something went wrong with the AI request." });
  }
};
