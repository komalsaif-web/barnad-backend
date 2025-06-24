export const handleChatMessage = async (req, res) => {
  const { message: userMessage } = req.body;

  if (!userMessage) {
    return res.status(400).json({ reply: "Message is required." });
  }

  if (!global.chatHistory) global.chatHistory = [];

  const chatHistory = global.chatHistory;

  try {
    if (chatHistory.length === 0) {
      chatHistory.push({
        role: "system",
        content: `
You are VRX, a helpful AI health assistant.

STEP 1:
Start by asking: "What’s your main health concern?" Example: fever, cough, headache.

STEP 2:
After the user responds, ask 3-4 symptom-related checklist questions based on that condition. Use:
- Yes
- No
- Sometimes

STEP 3:
Give a possible diagnosis. Keep suggestions short (4–5 words), e.g.:
- Take ibuprofen, rest well
- Drink water, use humidifier

Then ask:
✅ Did you like this suggestion?  
📄 Want this conversation as PDF?

If user replies "no", ask more questions and try again.
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

    // Clean up trailing notes
    aiReply = aiReply.replace(/This is AI-generated advice.*$/i, "").trim();

    // Always add feedback and export options
    aiReply += `\n\n✅ Did you like this suggestion?\n📄 Want this conversation as PDF?`;

    chatHistory.push({ role: "assistant", content: aiReply });

    res.json({ reply: aiReply });
  } catch (err) {
    console.error("❌ API Error:", err);
    res.status(500).json({ reply: "⚠️ Something went wrong with the AI request." });
  }
};
