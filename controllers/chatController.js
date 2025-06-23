import axios from "axios";

let chatHistory = [];

export const handleChatMessage = async (req, res) => {
  const userMessage = req.body.message;
  if (!userMessage) {
    return res.status(400).json({ reply: "Message is required." });
  }

  try {
    if (chatHistory.length === 0) {
      const classifyRes = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: "llama3-70b-8192",
          messages: [
            {
              role: "system",
              content:
                "You are a classifier. If the message is about health, symptoms, illness or medicine, reply with only 'yes'. Otherwise, reply 'no'.",
            },
            { role: "user", content: userMessage },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const isHealth = classifyRes.data.choices[0].message.content.trim().toLowerCase();
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

    const chatRes = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama3-70b-8192",
        messages: chatHistory,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const aiReply = chatRes.data.choices[0].message.content.trim();
    const finalReply = aiReply.replace(/This is AI-generated advice.*$/i, "💡 Get well soon! Stay healthy and take care!");

    chatHistory.push({ role: "assistant", content: finalReply });

    res.json({ reply: finalReply });
  } catch (err) {
    console.error("❌ API Error:", err.response?.data || err.message);
    res.status(500).json({ reply: "⚠️ Something went wrong with the AI request." });
  }
};
