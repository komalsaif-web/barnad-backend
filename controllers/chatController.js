// ✅ Built-in fetch (Node 18+ required)
const handleChatMessage = async (req, res) => {
  const { message: userMessage, history = [] } = req.body;

  if (!userMessage) {
    return res.status(400).json({ reply: 'Message is required.' });
  }

  try {
    // Step 1: Classify message (first message only)
    if (history.length === 0) {
      const classifyRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama3-70b-8192',
          messages: [
            {
              role: 'system',
              content: 'You are a classifier. If the message is about health, symptoms, illness or medicine, reply with only "yes". Otherwise, reply "no".',
            },
            { role: 'user', content: userMessage },
          ],
        }),
      });

      const classifyData = await classifyRes.json();
      const isHealth = classifyData.choices[0].message.content.trim().toLowerCase();

      if (isHealth !== 'yes') {
        return res.json({
          robust: true,
          reply:
            '⚠️ I’m here to assist only with **medicine or health-related issues**. Please describe your symptoms or ask about medicine.',
          updatedHistory: [],
        });
      }

      // Add system instruction if it's the first valid message
      history.push({
        role: 'system',
        content: `
You are a helpful medical assistant named VRX.
Ask the user one question at a time related to their symptoms.

After 2-3 user responses, suggest:
- a likely medical condition
- possible causes
- basic treatment (including a common medicine name if possible)

Always give answers as bullet points:
- Yes
- No
- Sometimes

DO NOT use A), B), C). Just use - for bullet points.

End your last reply with:
"💡 Get well soon! Stay healthy and take care!"
        `,
      });
    }

    // Step 2: Add user message
    history.push({ role: 'user', content: userMessage });

    // Step 3: Send message to Groq AI (LLaMA 3)
    const chatRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3-70b-8192',
        messages: history,
      }),
    });

    const chatData = await chatRes.json();
    const aiReply = chatData.choices[0].message.content.trim();

    // Optional clean-up of footer
    const finalReply = aiReply.replace(
      /This is AI-generated advice.*$/i,
      '💡 Get well soon! Stay healthy and take care!'
    );

    // Step 4: Save assistant reply
    history.push({ role: 'assistant', content: finalReply });

    // Step 5: Return reply and updated history
    res.json({
      reply: finalReply,
      updatedHistory: history,
    });
  } catch (err) {
    console.error('❌ API Error:', err);
    res.status(500).json({
      reply: '⚠️ Something went wrong with the AI request.',
      updatedHistory: history,
    });
  }
};

module.exports = { handleChatMessage };
