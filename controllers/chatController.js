export const handleChatMessage = async (req, res) => {
  const { message: userMessage } = req.body;

  if (!userMessage) {
    return res.status(400).json({ reply: "Message is required." });
  }

  if (!global.chatHistory) global.chatHistory = [];
  const chatHistory = global.chatHistory;

  try {
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

      chatHistory.push({
        role: "system",
        content: `
You are a helpful medical assistant named VRX.
Ask the user one question at a time related to their symptoms.

Give answers as bullet points like this:
- Yes
- No
- Sometimes

NEVER use A) B) C). Just use bullet points.

When you suggest a medicine or remedy, keep it short and highlight it, e.g.,:
- Take <highlight>ibuprofen</highlight>
- Drink <highlight>water</highlight>

After 2-3 questions, suggest a likely illness and a treatment.

Always end with:
✅ Do you agree with this suggestion? If not, I’ll ask more questions.

🧾 Would you like me to mark your session as complete?
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
    let aiReply = chatData.choices?.[0]?.message?.content?.trim() || "⚠️ Unable to get a valid response.";

    // Clean footer messages if LLaMA adds disclaimers
    aiReply = aiReply.replace(/This is AI-generated advice.*$/i, "").trim();

    // Always append your custom footer
    aiReply += `\n\n✅ Do you agree with this suggestion? If not, I’ll ask more questions.\n🧾 Would you like me to mark your session as complete?`;

    chatHistory.push({ role: "assistant", content: aiReply });

    res.json({ reply: aiReply });
  } catch (err) {
    console.error("❌ API Error:", err);
    res.status(500).json({ reply: "⚠️ Something went wrong with the AI request." });
  }
};
